// Use Parse.Cloud.define to define as many cloud functions as you want.
// For example:

function bonus(amount) {
  switch (amount) {
    case 2000:
      return 2000;
    case 5000:
    case 5250:
      return 5250;
    case 10000:
    case 11000:
      return 11000;
    case 25000:
    case 28000:
      return 28000;
    case 50000:
    case 65000:
      return 65000;
    default:
      return 0;
  }
}

Parse.Cloud.define("getRandomGame", function(request, response) {

  console.log("entered test getRandomGame 2");

  var fbId = request.params.fb_id;
  var level = request.params.level;
  var game = null;

  if (fbId == null)
    return response.error("Cloud call getRandomGame parameter fbId must be set.");

  if (level == null)
    return response.error("Cloud call getRandomGame parameter level must be set.");

  var levelInt = parseInt(level);
  var diff = 4;

  if (levelInt > 50)
      diff = 16;
  else if (levelInt > 25)
      diff = 6;

  // Set up to modify user data
  Parse.Cloud.useMasterKey();

  var query = new Parse.Query("Game")
  query.equalTo("status", "challenged");
  query.notEqualTo("challengerFBId", fbId);
  query.equalTo("matchSemaphore", 0);
  query.equalTo("challengeeUsername", "");
  query.equalTo("challengeeFBId", ""); // This will filter out any named challenges

  query.greaterThan("challengerLevel", levelInt - diff);
  query.lessThan("challengerLevel", levelInt + diff);
  // query.ascending("createdAt");

  query.limit(1);

  console.log("getRandomGame level of user=" + level);
  query.find({
    success: function(results) {
      var match = results[0];
      if (match == null) {
        return response.error("no game available 1");
      } else {
        match.increment("matchSemaphore", 1);
        console.log("getRandomGame level of challengee for game matched = " + match.get("challengeeLevel"));
        match.save().then(function(result) {
          if (match == null || match.get("matchSemaphore") > 1) {
            return response.error("no game available 2");
          } else {
            return response.success(match);
          }
        });
      }
    },
    error: function() {
      response.error("no game available 3");
    }
  });

});

Parse.Cloud.define("buyFacebookDD", function(request, response) {

  var quantity = request.params.quantity;
  var username = request.params.username;
  var fbPaymentId = request.params.fb_payment_id;

  if (quantity == null)
    return response.error("Cloud call buyFacebookDD parameter quantity must be set.");

  if (username == null)
    return response.error("Cloud call buyFacebookDD parameter username must be set.");

  if (fbPaymentId == null)
    return response.error("Cloud call buyFacebookDD parameter fb_payment_id must be set.");

  // TODO Verify FP Payment ID matches FB ID

  // Set up to modify user data
  Parse.Cloud.useMasterKey();

  var oldDollars, newDollars;
  // var query = new Parse.Query("User");
  var query = new Parse.Query(Parse.User);

  console.log("buyFacebookDD username=" + username + " query=" + query + " Parse.User=" + Parse.User);

  query.equalTo("username", username);
  query.each(function(user) {

      console.log("Found user " + user + " with id=" + user.id);

      oldDollars = user.get("dollars");
      var quantityInt = parseInt(quantity);
      newDollars = oldDollars + bonus(quantityInt);

      user.set("dollars", newDollars);
      user.save();

      var Transaction = Parse.Object.extend("Transaction");
      var transaction = new Transaction();
      transaction.set("type", "purchase");
      transaction.set("dd_spent", 0); 
      transaction.set("dd_bought", quantityInt);
      transaction.set("dd_total", newDollars);
      transaction.set("username", username);
      transaction.set("comment", "parse");
      transaction.save();
 
  }).then(function() {

    // Set the job's success status
    newDollars = newDollars.toString();
    response.success(newDollars);

    console.log("Found username=" + username + "  who purchased " + quantity + " dollars and had " + oldDollars + " and now has " + newDollars + " new dollars");

  }, function(error) {

    // Set the job's error status
    console.log("buyFacebookDD got error while updating users dollars");

    response.error("Was not able to update Dance Dollars.");
  });
});

Parse.Cloud.job("generateReport", function(request, response) {

  console.log("Generating report...");

  // Set up to modify user data
  Parse.Cloud.useMasterKey();

  reportAll(response);

});

function reportAll(response) {
  var query = new Parse.Query("Game");

  var gamesStartedAndNotCompleted = 0;
  var gamesCompleted = 0;
  var gamesStartedAndCompleted = 0;
  var highestScore = 0;
  var highestScoreName = "";
  var completedGameScoreSum = 0;
  var gameMsgText = "";

  var now = new Date(); // gets today
  var yesterday = new Date(now - 1000 * 60 * 60 * 24 * 1);
  query.greaterThan("updatedAt", yesterday);

  query.each(function(game) {

      // console.log("Found game with id " + game.id);

      var status = game.get("status");
      var createdAt = game.createdAt;
 
      if (status == "completed") {
        gamesCompleted++;
        var challengerScore = game.get("challengerScore");
        var challengeeScore = game.get("challengeeScore");

        if (challengerScore > highestScore || challengeeScore > highestScore) {
          highestScore = game.get("winningScore");
          highestScoreName = game.get("winnerName");
          console.log("highestScoreName=" + highestScoreName);
        }

        if (challengerScore > 0 && challengeeScore > 0) {
          if (challengerScore > challengeeScore)
            completedGameScoreSum = completedGameScoreSum + challengerScore;
          else
            completedGameScoreSum = completedGameScoreSum + challengeeScore;
        }

        if (createdAt > yesterday)
          gamesStartedAndCompleted++;
      } else if (status == "challenged") {
        gamesStartedAndNotCompleted++;
      }

      var challengerScore = game.get("challengerScore");
      if (typeof challengerScore == "undefined") {
        var recently = new Date(now - 1000 * 60 * 60 * 1 * 1);
        if (createdAt < recently) {
          var gameId = game.id;
          var challengerFBId = game.get("challengerFBId");
          var challengerComment = game.get("challengerComment");

          console.log("Found game to delete with id " + gameId + " and challengerFBId " + challengerFBId + " and challenger score=" + challengerScore + " and challengerComment " + challengerComment);

          game.destroy({
            success:function() {
              console.log("Deleted game with id " + gameId + " and challengerFBId " + challengerFBId + " and challenger score=" + challengerScore + " and challengerComment " + challengerComment);
            },
            error:function(error) {
              console.log("Failed to delete game with id " + gameId + " and challengerFBId " + challengerFBId + " and challenger score=" + challengerScore + " and challengerComment " + challengerComment);
            }
          });
        }
      }
  }).then(function() {
    // Set the job's success status
    var gamesStartedAndNotCompletedStr = "Games started but not completed: " + gamesStartedAndNotCompleted + '\n';
    var gamesCompletedStr = "Games completed: " + gamesCompleted + '\n';
    var gamesStartedAndCompletedStr = "Games started and completed: " + gamesStartedAndCompleted + '\n';
    var highestScoreStr = "Highest score: " + highestScore + '\n';
    var highestScoreNameStr = "Highest score name: " + highestScoreName + '\n';
    var completedGameAvgScoreStr = "Average score: " + Math.floor(completedGameScoreSum / gamesCompleted) + '\n';

    gameMsgText = "Games Daily Report: " + '\n' + gamesStartedAndNotCompletedStr + gamesCompletedStr + gamesStartedAndCompletedStr + completedGameAvgScoreStr + highestScoreStr+ highestScoreNameStr;

    console.log(gameMsgText);
    reportTransactions(response, gameMsgText, now, yesterday);

  }).then(function() {
    // response.success("Successfully completed generateReport.");
  }, function(error) {

    // Set the job's error status
    console.log("game report failed");

    response.error("generateReport failed");
  });
}

function reportTransactions(response, msgText, now, yesterday) {
  var query = new Parse.Query("Transaction");

  var transSpentCount = 0;
  var transSpentDD = 0;
  var transBoughtCount = 0;
  var transBoughtDD = 0;
  var retryCount = 0;
  var retryCost = 0;
  var itemsCount = 0;
  var itemsCost = 0;
  var levelsCount = 0;
  var levelsDDWon = 0;

  query.greaterThan("createdAt", yesterday);

  query.each(function(trans) {

      var ddSpent = trans.get("dd_spent");
      var ddBought = trans.get("dd_bought"); 
      var ddWin = trans.get("dd_win"); 
      var comment = trans.get("comment");
      var typeTrans = trans.get("type");

      if (ddSpent > 0) {
        transSpentCount++;
        transSpentDD += ddSpent;
      }

      if (ddBought > 0) {
        transBoughtCount++;
        transBoughtDD += ddBought;
      }

      if (comment == "retry") {
        retryCount++;
        retryCost += ddSpent;
      } else if (comment == "buy item") {
        itemsCount++;
        itemsCost += ddSpent;
      }

      if (typeTrans == "win") {
        levelsCount++;
        levelsDDWon += ddSpent;
      } 

  }).then(function() {
    // Set the job's success status
    var transSpentCountStr = "Number of times Dance Dollars spent: " + transSpentCount + '\n';
    var transSpentDDStr = "Total Dance Dollars spent: " + transSpentDD + '\n';
    var transBoughtCountStr = "Number of times Dance Dollars bought: " + transBoughtCount + '\n';
    var transBoughtDDStr = "Total Dance Dollars bought: " + transBoughtDD + '\n';

    var retryCountStr = "Number of times users retried: " + retryCount + '\n';
    var retryCostStr = "Average retry cost: " + (retryCost / retryCount) + '\n';

    var itemsCountStr = "Number of times items purchased: " + itemsCount + '\n';
    var itemsCostStr = "Average cost per item: " + Math.floor(itemsCost / itemsCount) + '\n';

    var levelsCountStr = "Number of times user leveled up: " + levelsCount + '\n';
    var levelsDDWonStr = "Total dance dollars won by users: " + levelsDDWon + '\n';

    msgText = msgText + '\n' + "Transactions Daily Report: " + '\n' + transSpentCountStr + transSpentDDStr + transBoughtCountStr + transBoughtDDStr + retryCountStr + retryCostStr + itemsCountStr + itemsCostStr + levelsCountStr + levelsDDWonStr;

    console.log(msgText);
    reportUsers(response, msgText, now, yesterday);

  }).then(function() {
    // response.success("Successfully completed generateReport.");
  }, function(error) {

    // Set the job's error status
    console.log("transaction report failed");

    response.error("generateReport failed");
  });
}

function reportUsers(response, msgText, now, yesterday) {

  var usersTotal = 0;
  var usersCreatedToday = 0;
  var usersUpdatedToday = 0;
  var usersGames = 0;
  var usersExperience = 0;

  var query = new Parse.Query("User");

  // console.log("Querying users");

  query.each(function(user) {

      var createdAt = user.createdAt;
      var updatedAt = user.updatedAt;

      usersTotal++;
      if (createdAt > yesterday)
        usersCreatedToday++;
      if (updatedAt > yesterday)
        usersUpdatedToday++;
      if (user.get("games") > 0)
        usersGames++;
      if (user.get("experience") > 0)
        usersExperience++;

  }).then(function() {

    // console.log("Got queried users");

    // Set the job's success status
    var usersTotalStr = "Users Total: " + usersTotal + '\n';
    var usersCreatedTodayStr = "Users Created Today: " + usersCreatedToday + '\n';
    var usersUpdatedTodayStr = "Users Updated Today: " + usersUpdatedToday + '\n';
    var usersGamesStr = "Users Total Who Have Played At Least One Game: " + usersGames + '\n';
    var usersExperienceStr = "Users Total Who Have Earned Experience Points: " + usersExperience + '\n';

    var userMsgText = "User Daily Report: " + '\n' + usersTotalStr + usersCreatedTodayStr + usersUpdatedTodayStr + usersGamesStr + usersExperienceStr;

    console.log(userMsgText);

    var Mailgun = require('mailgun');

    Mailgun.initialize('strangelings.mailgun.org', 'key-0rhtp5nputxn66-sl3e8o822i943up88');
    Mailgun.sendEmail({
      to: "admin@fmigames.com",
      from: "admin@fmigames.com",
      subject: "Daily Report for Dance Off Users and Games",
      text: "Report Date: " + now + '\n\n' + msgText + '\n' + userMsgText
    }, {
      success: function(httpResponse) {
        console.log(httpResponse);
        response.success("Report Email sent!");
      },
      error: function(httpResponse) {
        console.error(httpResponse);
        response.error("Generate Report error while emailing report");
      }
    });
    response.success("Successfully completed generateReport.");
  }, function(error) {

    // Set the job's error status
    console.log("user report failed");

    response.error("generateReport failed");
  });
}

