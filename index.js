
var Request = require("request-promise");
var Parser = require("./app/messageParser");
var Commands = require("./app/commands");
var TelegramToken = require("./app/token");

exports.handler = function (event, context) {
    console.log(event.body);
    var processCommand = processCommands(event);
    if ((event.body.message && event.body.message.from && event.body.message.from.id) ||
        (event.body.callback_query && event.body.callback_query.data)) {
        var userId = (event.body.message || event.body.callback_query).from.id;
        processCommand.then(function (response) {
            if (!response) {
                context.succeed();
                return;
            } 
            var processTelegram = sendMessageToTelegram(
                userId,
                response
            );
            processTelegram.then(function () {
                context.succeed();
            }).catch(function (e) {
                console.log(e);
                context.fail();
            });
        }).catch(function (error) {
            console.log(error);
            context.succeed();
            // hide errors from users for now
            /*var processTelegram = sendMessageToTelegram(
                userId,
                error.message
            );
            processTelegram.then(function () {
                context.succeed();
            }).catch(function () {
                context.fail();
            });*/
        });
    } else {
        processCommand.then(function () {
            context.succeed();
        }).catch(function () {
            context.fail();
        });
    }

    return processCommand;
};

function sendMessageToTelegram(userId, message) {
    var data = (typeof (message) === "string") ? { text: message } : message;
    data["chat_id"] = userId;
    data["parse_mode"] = "HTML";
    console.log(data);
    return Request({
        method: "POST",
        uri: "https://api.telegram.org/bot" + TelegramToken + "/sendMessage",
        form: data
    });
}

function answerCallbackToTelegram(message) {
    return Request({
        method: "POST",
        uri: "https://api.telegram.org/bot" + TelegramToken + "/answerCallbackQuery",
        form: {
            callback_query_id: message.id,
            text: "Wait a second. I'm counting!"
        }
    });
}

function processCommands(event) {
    if (event.body && event.body.callback_query) {
        answerCallbackToTelegram(event.body.callback_query);
    }
    if (event.body && (event.body.message || event.body.callback_query)) {
        var income = event.body.message || event.body.callback_query;
        var commandArguments = Parser.tryGetCommand(income);
        console.log(commandArguments);
        if (commandArguments === null) {
            return Commands.ignoreMessage("Invalid Command");
        }

        var commandKeys = Object.keys(commandArguments);
        if (commandKeys.length === 0 && !Commands[commandKeys[0]]) {
            return Commands.ignoreCommand("Invalid Command");
        }

        var command = commandKeys[0];
        return Commands[command](income, commandArguments[command]);
    }

    return Commands.error("Event not specified");
}
