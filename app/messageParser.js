'use strict';

const messageParser = {};

messageParser.extractLoot = function (msg) {
    let lootReg = /Получено:\s*(\W*)\((\d+)/gi;
    let lootCounter = [];
    let match = null;
    while ((match = lootReg.exec(msg.text))) {
        if (match.index === lootReg.lastIndex) {
            lootReg.lastIndex++;
        }
        if (!!(match[1]) && match[1].length > 0) {
            lootCounter.push({
                lootType: match[1].trim(),
                count: match[2]
            });
        }
    }
    return lootCounter;
};

messageParser.extractExp = function (msg) {
    let goldInfo = {
        isSuccessful: false,
        experience: 0,
        gold: 0,
        quest: msg.text
    };
    let goldReg = /Ты заработал:\s*(\d+) опыт\W* и (\d+) золот\W* монет/i;
    let match = goldReg.exec(msg.text);
    if (match == null) {
        return goldInfo;
    }
    goldInfo.isSuccessful = true;
    goldInfo.experience = match[1];
    goldInfo.gold = match[2];
    goldInfo.quest = goldInfo.quest.substr(0, match.index);
    return goldInfo;
};

messageParser.isChatWarsMessage = function(msg) {
    if (!msg || !msg.forward_from) {
        return false;
    }
    const chartWarsBotId = 265204902;
    const chartWarsBotName = "ChatWarsBot";
    return (msg.forward_from.id === chartWarsBotId);
};

messageParser.tryGetCommand = function (msg) {
    if (!msg) {
        return null;
    }
    if (msg.forward_from || msg.forward_date) {
        return {"forward": []};
    }
    var info = (msg.data || msg.text).trim();
    var tokens = info.split(" ");
    if (!tokens[0].match(/^\//)) {
        return null;
    }
    var command = {};
    var cmd = tokens.shift();
    var m = cmd.match(/\/(\w*)/);
    if (m.length > 0) {
        command[m[1]] = tokens;
    }
    return command;
};

module.exports = messageParser;

