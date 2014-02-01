// Use Parse.Cloud.define to define as many cloud functions as you want.
// For example:

function bonus(amount) {
  switch (amount) {
    case 200:
      return 200;
    case 500:
    case 525:
      return 525;
    case 1000:
    case 1100:
      return 1100;
    case 2500:
    case 2800:
      return 2800;
    case 5000:
    case 6500:
      return 6500;
    default:
      return 0;
  }
}

Parse.Cloud.define("getRandomGame", function(request, response) {

  console.log("entered test getRandomGame 2");

  var fbId = request.params.fb_id;
  var game = null;

  if (fbId == null)
    return response.error("Cloud call getRandomGame parameter fbId must be set.");

  // Set up to modify user data
  Parse.Cloud.useMasterKey();

  var query = new Parse.Query("GameSubClass")
  query.equalTo("status", "challenged");
  query.notEqualTo("challengerFBId", fbId);
  query.equalTo("matchSemaphore", 0);
  // query.equalTo("objectId", "htpDqGRI6Qa");
  query.ascending("createdAt");
  query.limit(1);

  query.find({
    success: function(results) {
      var match = results[0];
      if (match == null) {
        return response.error("no game available");
      } else {
        match.increment("matchSemaphore", 1);
        match.save().then(function(result) {
          if (match == null || match.get("matchSemaphore") > 1) {
            return response.error("no game available");
          } else {
            return response.success(match);
          }
        });
      }
    },
    error: function() {
      response.error("no game available");
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
  var query = new Parse.Query(Parse.User);

  query.equalTo("username", username);
  query.each(function(user) {

      console.log("Found user " + user + " with id=" + user.id);

      oldDollars = user.get("dollars");
      var quantityInt = parseInt(quantity);
      newDollars = oldDollars + bonus(quantityInt);

      user.set("dollars", newDollars);
      user.save();

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

  var Mailgun = require('mailgun');
  Mailgun.initialize('strangelings.mailgun.org', 'key-0rhtp5nputxn66-sl3e8o822i943up88');

  var query = new Parse.Query("GameSubClass");

  var gamesStartedAndNotCompleted = 0;
  var gamesCompleted = 0;
  var gamesStartedAndCompleted = 0;
  var highestScore = 0;
  var highestScoreUsername = "";
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
   
        if (challengerScore > highestScore) {
          highestScore = challengerScore;
          highestScoreUsername = game.get("challengerUsername");
        } else if (challengeeScore > highestScore) {
          highestScore = challengeeScore;
          highestScoreUsername = game.get("challengeUsername");
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

  }).then(function() {

    // Set the job's success status
    var gamesStartedAndNotCompletedStr = "Games started but not completed: " + gamesStartedAndNotCompleted + '\n'; 
    var gamesCompletedStr = "Games completed: " + gamesCompleted + '\n';
    var gamesStartedAndCompletedStr = "Games started and completed: " + gamesStartedAndCompleted + '\n';
    var highestScoreStr = "Highest score: " + highestScore + '\n';
    var highestScoreUsernameStr = "Highest score username: " + highestScoreUsername + '\n';
    var completedGameAvgScoreStr = "Average score: " + Math.floor(completedGameScoreSum / gamesCompleted) + '\n';

    gameMsgText = "Games Daily Report: " + '\n' + gamesStartedAndNotCompletedStr + gamesCompletedStr + gamesStartedAndCompletedStr + completedGameAvgScoreStr + highestScoreStr+ highestScoreUsernameStr; 
 
    console.log(gameMsgText);

  }).then(function() {

    console.log("About to query users");
    var usersTotal = 0;
    var usersCreatedToday = 0;
    var usersUpdatedToday = 0;
    var usersGames = 0;
    var usersExperience = 0;
   
    var query = new Parse.Query("User");

    console.log("Querying users...");

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

      // Set the job's success status
      var usersTotalStr = "Users Total: " + usersTotal + '\n';
      var usersCreatedTodayStr = "Users Created Today: " + usersCreatedToday + '\n';
      var usersUpdatedTodayStr = "Users Updated Today: " + usersUpdatedToday + '\n';
      var usersGamesStr = "Users Total Who Have Played At Least One Game: " + usersGames + '\n';
      var usersExperienceStr = "Users Total Who Have Earned Experience Points: " + usersExperience + '\n';

      var userMsgText = "User Daily Report: " + '\n' + usersTotalStr + usersCreatedTodayStr + usersUpdatedTodayStr + usersGamesStr + usersExperienceStr;
   
      console.log(userMsgText);

      Mailgun.initialize('strangelings.mailgun.org', 'key-0rhtp5nputxn66-sl3e8o822i943up88');
      Mailgun.sendEmail({
        to: "hamilton@fmigames.com",
        from: "admin@fmigames.com",
        subject: "Daily Report for Dance Off Users and Games",
        text: gameMsgText + '\n' + userMsgText
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
      console.log("generateReport error");

      response.error("generateReport failed");
    });

  }, function(error) {

    // Set the job's error status
    console.log("generateReport error");

    response.error("generateReport failed");
  });
});


