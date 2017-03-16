"use strict";

const promise = require("bluebird");
const parser = require("./messageParser");
const DbContext = require("./dbContext");
const db = new DbContext();
const commands = {};


commands.error = function(error) {
    return promise.reject(new Error(error.message));
};

commands.ignoreMessage = function () {
    return promise.resolve(null);
};

commands.ignoreCommang = function () {
    return promise.resolve(null);
};

commands.hello = function (msg, data) {
    let response = { text: "Приветствую, " + (msg.from.username || msg.from.first_name || "друг") + "!\n I'm ready to count your success!" };
    return promise.resolve(response);
};

commands.start = function (msg, data) {
    let message = "Приветствую, " + (msg.from.username || msg.first_name || "друг") +
        "!\n Я готов подсчитывать твои успехи в ChatWars!\n\n" + 
        "Пересылай мне результаты своих квестов и следи с моей помощью за своим прогрессом.\n\n" +
        "Эти команды тебе могут пригодиться:\n" +
        "/loot - статистика по луту\n" +
        "/me - персональная статистика за неделю, месяц, все время\n" + 
        "/top - топ по экспе, золоту, квестам или луту\n" + 
        "/help - список команд (если вдруг забыл)";
    return promise.resolve({ text: message });
}

commands.help = function () {
    let message = "Поддерживаемые команды: \n\n" +
        "/loot - статистика по луту\n" +
        "/me - персональная статистика за неделю, месяц, все время\n" +
        "/top - топ по экспе, золоту, квестам или луту\n"; 
    return promise.resolve({ text: message});
}

commands.forward = function (msg, data) {
    return db.checkDuplicates(msg)
        .then(function (isDuplicate) {
            if (isDuplicate) {
                return promise.resolve({ text: "Хм, я где-то видел это раньше"});
            }
            let exp = parser.extractExp(msg);
            let loot = parser.extractLoot(msg);
            return db
                .checkQuest(exp.quest)
                .then(function (info) {
                    return db.saveQuestResult(msg, { exp: exp, loot: loot, location: info.location, isKnownQuest: info.isKnown });
                }).then(function (info) {
                    console.log(info);
                    if (!!(info.location)) {
                        let message = info.exp.isSuccessful ? "Победа!" : "В следующий раз тебе повезет больше!";
                        return promise.resolve({ text: message });
                    }
                    let keyboard = [
                        [
                            { text: "Лес", callback_data: "/confirm forest " + msg.message_id + " " + info.id},
                            { text: "Пещера", callback_data: "/confirm cave " + msg.message_id + " " + info.id}
                        ]
                    ];
                    if (!info.exp.isSuccessful) {
                        keyboard.push([
                            { text: "Это не квест!", callback_data: "/confirm not " + msg.message_id + " " + info.id}
                        ]);
                    }
                    return promise.resolve({
                        text: "Воу, это что-то новенькое. И откуда все это?",
                        reply_markup: JSON.stringify({ inline_keyboard: keyboard })
                    });
                });
        });
};

commands.me = function(msg, data) {
    return db.getPersonalStats(msg.from.id)
        .then(function (result) {
            let stats = result[0];
            let message = "Статистика:\n\n";
            message += "Переслано квестов: " + stats.total + "\n";
            message += "Из них успешных: " + stats.succesful + "\n";
            message += "Получено опыта: " + stats.exp + "\n";
            message += "Получено золота: " + stats.gold;
            return promise.resolve({ text: message });
        });
}

commands.top = function(msg, data) {
    let topType = null;
    if (!!data && !!data.length) {
        topType = (data[0] + "").trim().toLowerCase();
    }
    let isSpecial = topType !== "loot";
    switch (topType) {
        case "exp":
        case "gold":
        case "quests":
            return db.getTopExpGold(topType)
                .then(function(rows) {
                    if (!rows || !rows.length) {
                        return { text: "Прости, но у меня пока недостаточно данных для этого рейтинга"};
                    }
                    let response = "Вот мой рейтинг по " + (topType === "exp" ? "опыту" :
                        (topType === "gold" ? "золоту": "Квестам")) + "\n\n";
                    for (var i = 0; i < rows.length; i++) {
                        let item = rows[i];
                        response += (i + 1) + ". "
                            + (item.Username || item.FirstName || item.Id)
                            + " - " + item[topType] + "\n";
                    }
                    return { text: response };
                });
        case "loot":
        case "loot_special":
            return db.getTopLoot(isSpecial)
                .then(function(rows) {
                    if (!rows || !rows.length) {
                        return { text: "Прости, но у меня пока недостаточно данных для этого рейтинга" };
                    }
                    let response = "Вот мой рейтинг по " + (isSpecial ?
                        ("предмету " + rows[0]["lootType"]) :
                        "всем предметам") + "\n\n";
                    for (var i = 0; i < rows.length; i++) {
                        let item = rows[i];
                        response += (i + 1) + ". " +
                            (item.Username || item.FirstName || item.Id) +
                            " - " + item.total + "\n";
                    }
                    return { text: response };
                });
        default:
            return promise.resolve({
                text: "Выбери тип рейтинга",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [
                            { text: "Опыт", callback_data: "/top exp" },
                            { text: "Золото", callback_data: "/top gold" },
                            { text: "Квесты", callback_data: "/top quests" }
                        ], [
                            { text: "Все предметы", callback_data: "/top loot" },
                            { text: "Случайный предмет", callback_data: "/top loot_special" }
                        ]
                    ]
                })
            });
    }
}

commands.loot = function (msg, data) {
    let location = null;
    if (!!data && !!data.length) {
        location = (data[0] + "").trim().toLowerCase();
    }
    let locName = "все локации разом";
    if (location === "forest") {
        locName = "Лес";
    } else if (location === "cave") {
        locName = "Пещеру";
    }
    switch (location) {
        case "forest":
        case "cave":
        case "all":
            return db.getLootStat(location)
                .then(function (rows) {
                    console.log(rows);
                    if (!rows || !rows.length) {
                        return { text: "Прости, но у меня нет знаний про " + locName };
                    }
                    let loot = rows.sort((a, b) => b.Total - a.Total);
                    let response = "Это то, что я знаю про " + locName + "\n\n";
                    let total = 0;
                    for (var j = 0; j < loot.length; j++) {
                        total += loot[j].Total;
                    }
                    for (var i = 0; i < loot.length; i++) {
                        let item = loot[i];
                        let chance = (item.Total * 100 / total).toFixed(1);
                        response += item.LootType + " : " + item.Total + " (Шанс получения " + chance + "%)\n";
                    }
                    return { text: response };
                });
        default:
            //ask about 
            return promise.resolve({
                text: "Какая локация интересует?",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [
                            { text: "Лес", callback_data: "/loot forest" },
                            { text: "Пещера", callback_data: "/loot cave" }
                        ], [
                            { text: "Все и сразу", callback_data: "/loot all" }
                        ]
                    ] })
            });
    }
};

commands.confirm = function (msg, data) {
    if (!msg.data || data.length !== 3) {
        return promise.resolve(null);
    }
    return db.updateLocation(data[0], data[1], data[2], msg.from.id)
        .then(function() {
            return { text: "Спасибо, я запомнил!" }
        });
};

module.exports = commands;
