const pLimit = require("p-limit");
const {
  getZohoTokenOptimized,
  getAnalysisData,
} = require("./common.component");
const moment = require("moment");
const { default: axios } = require("axios");
const limit = pLimit(20);

const updateCoinsOnZoho = async (email, coins) => {
  try {
    const accessToken = await getZohoTokenOptimized();
    const zohoConfig = {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        Authorization: `Bearer ${accessToken}`,
      },
    };
    const updatedCoins = (coins || 0) + 300;
    const body = {
      data: [
        {
          Email: email,
          Coins: updatedCoins,
          $append_values: {
            Coins: true,
          },
        },
      ],
      duplicate_check_fields: ["Email"],
      apply_feature_execution: [
        {
          name: "layout_rules",
        },
      ],
      trigger: ["workflow"],
    };
    const data = await axios.post(
      `https://www.zohoapis.com/crm/v3/Contacts/upsert`,
      body,
      zohoConfig
    );
    return { status: data.data.data[0].status, email: email };
  } catch (error) {
    throw new Error(error.message);
  }
};

const createCoinsHistory = async (email, contactId, percentage) => {
  try {
    const accessToken = await getZohoTokenOptimized();
    const zohoConfig = {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        Authorization: `Bearer ${accessToken}`,
      },
    };
    const currentDate = moment().format("YYYY-MM-DD");
    const body = {
      data: [
        {
          Contact: contactId,
          Coins: 300,
          Action_Type: "Credit",
          Description: percentage
            ? "Top 3 Highest Percentage Weekly"
            : "Top 3 Highest Scorers Weekly",
          Updated_Date: currentDate,
        },
      ],
      apply_feature_execution: [
        {
          name: "layout_rules",
        },
      ],
      trigger: ["workflow"],
    };
    const data = await axios.post(
      `https://www.zohoapis.com/crm/v3/Coins`,
      body,
      zohoConfig
    );
    return { status: data.data.data[0].status, email: email };
  } catch (error) {
    throw new Error(error.message);
  }
};

const updateCoinsForWeeklyToppers = async () => {
  try {
    const accessToken = await getZohoTokenOptimized();
    const zohoConfig = {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        Authorization: `Bearer ${accessToken}`,
      },
    };
    const today = moment();
    const currDay = today.day();
    const diff = today.date() - currDay + (currDay === 0 ? -6 : 1);
    const monday = moment(new Date(today.date(diff)));
    const sunday = monday.clone().add(6, "days");
    // current week's Monday
    const formattedDateStart = `${monday.format("YYYY-MM-DD")}T00:00:00+05:30`;
    // current week's Sunday
    const formattedDateEnd = `${sunday.format("YYYY-MM-DD")}T23:59:59+05:30`;

    let currentPage = 0;
    const attempts = [];
    while (true) {
      // Find all attempts for this week from Monday to Sunday
      const attemptsQuery = `select Contact_Name.id as contactId, Contact_Name.Email as Email,Contact_Name.Student_Grade as Student_Grade, Quiz_Score, Contact_Name.Coins as Coins, Session.Number_of_Questions as Total_Questions from Attempts where Session_Date_Time between '${formattedDateStart}' and '${formattedDateEnd}' order by Session_Date_Time asc limit ${
        currentPage * 2000
      }, 2000`;
      const attemptsResponse = await getAnalysisData(attemptsQuery, zohoConfig);
      if (attemptsResponse.status === 204) {
        return { status: "noattempts" };
      }
      // Add the attempts to array until no more attmepts
      attempts.push(...attemptsResponse.data.data);
      if (!attemptsResponse.data.info.more_records) {
        break;
      }
      currentPage++;
    }
    const uniqueUsers = {};
    // combine quiz score for each user
    attempts.forEach((attempt) => {
      if (uniqueUsers[attempt.Email]) {
        uniqueUsers[attempt.Email].Quiz_Score += attempt.Quiz_Score;
        uniqueUsers[attempt.Email].Total_Questions += attempt.Total_Questions;
      } else {
        uniqueUsers[attempt.Email] = { ...attempt };
      }
    });
    const uniqueUsersArray = Object.values(uniqueUsers);

    const grade1And2 = [];
    const grade3 = [];
    const grade4 = [];
    const grade5 = [];
    const grade6 = [];
    const grade7And8 = [];

    // split the attempts grade wise
    uniqueUsersArray.forEach((attempt) => {
      switch (attempt.Student_Grade) {
        case "1":
        case "2":
          grade1And2.push(attempt);
          break;
        case "3":
          grade3.push(attempt);
          break;
        case "4":
          grade4.push(attempt);
          break;
        case "5":
          grade5.push(attempt);
          break;
        case "6":
          grade6.push(attempt);
          break;
        case "7":
        case "8":
          grade7And8.push(attempt);
          break;
        default:
          break;
      }
    });

    // get top 3 from each grade based on the quiz score.
    const topThreeUsers = [];
    const grades = [grade1And2, grade3, grade4, grade5, grade6, grade7And8];
    grades.forEach((grade) => {
      const topThree = grade
        .sort((a, b) => b.Quiz_Score - a.Quiz_Score)
        .slice(0, 3);
      topThreeUsers.push(...topThree);
    });

    // remove top 3 from the grades array
    const filterTopThree = (grade) =>
      grade.filter(
        (user) => !topThreeUsers.some((topUser) => topUser.Email === user.Email)
      );

    const filteredGrades = grades.map(filterTopThree);

    // add percentage for the remaining users per grade
    filteredGrades.forEach((grade) => {
      grade.forEach((user) => {
        user.percentage = (user.Quiz_Score / user.Total_Questions) * 100;
      });
    });

    // get top 3 users based on the percentage.
    const topThreePercentageUsers = [];
    filteredGrades.forEach((grade) => {
      const topThree = grade
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 3);
      topThreePercentageUsers.push(...topThree);
    });

    // update coins and create coins history on zoho for top 3 scorers.
    await Promise.all(
      topThreeUsers.map(async (user) => {
        const [updateCoinsResult, addCoinsHistoryResult] = await Promise.all([
          limit(() => updateCoinsOnZoho(user.Email, user.Coins)),
          limit(() => createCoinsHistory(user.Email, user.contactId, false)),
        ]);
        return {
          updateCoins: { ...updateCoinsResult },
          addCoins: { ...addCoinsHistoryResult },
        };
      })
    );

    // update coins and create coins history on zoho for top 3 percentage users.
    await Promise.all(
      topThreePercentageUsers.map(async (user) => {
        const [updateCoinsResult, addCoinsHistoryResult] = await Promise.all([
          limit(() => updateCoinsOnZoho(user.Email, user.Coins)),
          limit(() => createCoinsHistory(user.Email, user.contactId, true)),
        ]);
        return {
          updateCoins: { ...updateCoinsResult },
          addCoins: { ...addCoinsHistoryResult },
        };
      })
    );

    return {
      status: "Success",
    };
  } catch (error) {
    throw new Error(error);
  }
};

module.exports = { updateCoinsForWeeklyToppers };
