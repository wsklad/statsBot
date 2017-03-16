"use strict";

const promise = require("bluebird");
const mysql = require("promise-mysql");
const config = require("./dbconfig");

let MySqlContext = function() {

    const pool = mysql.createPool(config);

    //pool.query("SET NAMES 'utf8'");
    //pool.query("SET CHARACTER SET 'utf8'");
    //pool.query("SET SESSION collation_connection = 'utf8_general_ci'");

    this.checkDuplicates = function(message) {
        let checkQuery = null;
        if (!!message.forward_from_message_id) {
            checkQuery = mysql.format(
                "SELECT COUNT(*) FROM ExpStats WHERE MessageId = ?",
                [message.forward_from_message_id]);
        } else {
            checkQuery = mysql.format(
                "SELECT COUNT(*) FROM ExpStats WHERE UserId = ? AND OriginDate = FROM_UNIXTIME(?)",
                [message.from.id, message.forward_date]);
        }
        return pool.query(checkQuery)
            .then(function (rows) {
                    return rows.length && (rows[0]["COUNT(*)"] > 0);
            });
    }

    this.saveQuestResult = function (message, data) {
        // get info about quest
        // if known location - submit
        // if unknown location - ask for
        let expQuery = mysql.format(
            "INSERT INTO `ExpStats` " +
            "(`MessageId`, `UserId`, `Experience`, `Gold`, `Date`, `OriginMessageId`, `OriginDate`, `Location`, `IsSuccessful`) " +
            "VALUES (?, ?, ?, ?, FROM_UNIXTIME(?), ?, FROM_UNIXTIME(?), ?, ?)",
            [
                message.message_id, message.from.id, data.exp.experience, data.exp.gold, message.date,
                message.forward_from_message_id, message.forward_date,
                data.location, (data.exp.isSuccessful ? 1 : 0)
            ]);
        let user = message.from;
        let userQuery = mysql.format("INSERT INTO Users (`UserId`, `Username`, `FirstName`, `LastName`, `HeroName`) " +
            "VALUES(?, ?, ?, ?, ?) " +
            "ON DUPLICATE KEY UPDATE `Username`=?, `FirstName` = ?, `LastName` = ?, `HeroName` = ?",
            [user.id,
                user.username || null, user.first_name || null, user.last_name || null, null,
                user.username || null, user.first_name || null, user.last_name || null, null
            ]);
        let lootQuery = null;
        if (data.loot.length > 0) {
            let lootValuesTemplate = "(?, ?, FROM_UNIXTIME(?), ?, FROM_UNIXTIME(?), ?, ?, ?)";
            let lootInfos = [];
            for (var i = 0; i < data.loot.length; i++) {
                lootInfos.push(mysql.format(lootValuesTemplate,
                [
                    message.message_id, message.from.id, message.date,
                    message.forward_from_message_id, message.forward_date,
                    data.loot[i].lootType, data.loot[i].count, data.location
                ]));
            }
            lootQuery = "INSERT INTO LootStats (`MessageId`, `UserId`, `Date`, " +
                "`OriginMessageId`, `OriginDate`, `LootType`, `Count`, `Location`) " +
                "VALUES " +
                lootInfos.join();
        }
        pool.query(userQuery);
        pool.query(expQuery);
        if (!!lootQuery) {
            pool.query(lootQuery);
        }
        if (!data.isKnownQuest) {
            this.insertQuest(data.exp.quest, data.location);
        }
        // we don't wait the result for now
        return promise.resolve(data);
    }

    this.updateLocation = function(location, messageId, questId, userId) {
        let id = parseInt(messageId);
        location = (location + "").trim().replace('_', '');
        if (!isNaN(id) && (location === "forest" || location === "cave")) {
            // ensure there is no invinsible symbols
            location = (location === "cave") ? "cave" : "forest";
            let updateExp = mysql.format("UPDATE `ExpStats` SET `Location` = ? WHERE `MessageId` = ? AND `UserId` = ? LIMIT 1",
                [location, id, userId]);
            let updateLoot = mysql.format("UPDATE `LootStats` SET `Location` = ? WHERE `MessageId` = ? AND `UserId` = ?",
                [location, id, userId]);
            let updateQuest = this;
            pool.query(updateExp)
                .then(function (response) {
                    //todo check that there were updated strings
                    return updateQuest(questId, location);
                });
            pool.query(updateLoot);
        }
        // we don't wait the result for now
        return promise.resolve([]);
    }

    this.insertQuest = function (quest, location) {
        let isForest = location === "forest";
        let isCave = location === "cave";
        let query = mysql.format("INSERT INTO Quests (Text, ForestVotes, CaveVotes, NotQuestVotes) " +
            "VALUES (?, ?, ?, ?)",
            [quest, isForest, isCave, !(isForest || isCave)]);
        return pool.query(query);
    }

    this.updateQuest = function (questId, location) {
        location = (location + "").trim().replace("_", "");
        questId = parseInt(questId);
        let query = "UPDATE Quests SET ";
        if (location === "forest") {
            query = query + "ForestVotes = ForestVotes + 1, Location = IF(ForestVotes > 9, 'forest', Location)";
        } else if (location === "cave") {
            query = query + "CaveVotes = CaveVotes + 1, Location = IF(CaveVotes > 9, 'cave', Location)";
        } else {
            query = query + "NotQuestVotes = NotQuestVotes + 1, IsQuest = IF(NotQuestVotes > 9, 1, 0)";
        }
        query = query + mysql.format(" WHERE Id = ?", questId);
        return pool.query(query);
    }

    this.checkQuest = function (quest) {
        let checkQuest = mysql.format("SELECT * from Quests WHERE Text = ? LIMIT 1", [quest]);
        return pool
                .query(checkQuest)
                .then(function(rows) {
                    let result = {
                        isKnown: !!rows.length,
                        location: null,
                        isQuest: true
                    }
                    if (result.isKnown) {
                        result.location = rows[0]["Location"];
                        result.isQuest = !!(rows[0]["IsQuest"]);
                    }
                    return result;
                });
    }

    this.getLootStat = function(location) {
        let lootStatQuery = "SELECT LootType, SUM(Count) AS Total FROM LootStats";
        if (location === "forest" || location === "cave") {
            //todo replace like with =  later
            lootStatQuery += " WHERE Location LIKE '%" + location + "'";
        }
        lootStatQuery = lootStatQuery + " GROUP BY LootType";
        console.log('getLootStat ' + location);
        return pool.query(lootStatQuery);
    }

    this.getTopExpGold = function(type) {
        let query = "SELECT ExpStats.UserId as UserId, " +
            "SUM(ExpStats.Experience) as exp, " +
            "SUM(ExpStats.Gold) as gold, " +
            "SUM(ExpStats.IsSuccessful) as quests, " +
            "Users.Username as Username, " +
            "Users.FirstName as FirstName, " +
            "Users.LastName as LastName, " +
            "Users.HeroName as HeroName " +
            "FROM ExpStats LEFT JOIN Users ON Users.UserId = ExpStats.UserId " +
            "group by ExpStats.UserId";
        return pool.query(query).then(function(rows) {
            if (rows && rows.length) {
                rows.sort((a, b) => { return b[type] - a[type]; });
            }
            return rows.slice(0, 10);
        });
    }

    this.getTopLoot = function (isSpecial) {
        let query = "SELECT LootStats.UserId as UserId, " +
            "SUM(LootStats.Count) as total, " +
            "(LootStats.LootType) as lootType, " +
            "Users.Username as Username, " +
            "Users.FirstName as FirstName, " +
            "Users.LastName as LastName, " +
            "Users.HeroName as HeroName " +
            "FROM LootStats LEFT JOIN Users ON Users.UserId = LootStats.UserId ";
        if (isSpecial) {
            query += mysql.format("WHERE LootStats.LootType = (select LootType from SpecialLootType Order by RAND() limit 1) ");
        }
        query = query + "group by LootStats.UserId";
        return pool.query(query).then(function (rows) {
            if (rows && rows.length) {
                rows.sort((a, b) => { return b.total - a.total; });
            }
            return rows.slice(0, 10);
        });
    }


    this.testConnection = function() {
        return pool.query("SELECT 1 + 1 AS solution");
    }

    this.getPersonalStats = function(userId) {
        let personalQuery = mysql.format("Select Count(*) as total, Sum(Experience) as exp,  " +
            "Sum(Gold) as gold, Sum(IsSuccessful) as succesful " +
            "From ExpStats Where UserId = ?",
            [userId]);
        return pool.query(personalQuery);
    }
};

module.exports = MySqlContext;