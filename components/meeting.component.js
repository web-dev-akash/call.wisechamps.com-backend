const { default: axios } = require("axios");
const { getZohoTokenOptimized } = require("./common.component");

const freeMeetLink = process.env.FREE_MEETING_LINK;

const getMeetingLink = async (emailParam) => {
  const accessToken = await getZohoTokenOptimized();
  const zohoConfig = {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      Authorization: `Bearer ${accessToken}`,
    },
  };

  const contact = await axios.get(
    `https://www.zohoapis.com/crm/v2/Contacts/search?email=${emailParam}`,
    zohoConfig
  );

  if (contact.status >= 400) {
    return {
      status: contact.status,
      mode: "internalservererrorinfindinguser",
    };
  }

  if (contact.status === 204) {
    return {
      status: contact.status,
      mode: "nouser",
    };
  }

  const contactid = contact.data.data[0].id;
  const email = contact.data.data[0].Email;
  const grade = contact.data.data[0].Student_Grade;

  let gradeGroup;
  if (grade == 1 || grade == 2) {
    gradeGroup = "1;2";
  } else if (grade == 7 || grade == 8) {
    gradeGroup = "7;8";
  } else gradeGroup = grade;

  const name = contact.data.data[0].Student_Name;
  const credits = Number(contact.data.data[0].Credits) || 0;

  const address = contact.data.data[0].Address;
  const pincode = contact.data.data[0].Pincode;
  const gradeUpdated = contact.data.data[0].Grade_Updated;
  const date = new Date();
  const start = new Date();
  start.setMinutes(start.getMinutes() + 270);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const formattedDateStart = `${year}-${month}-${day}T00:00:00+05:30`;
  const formattedDateEnd = `${year}-${month}-${day}T23:59:00+05:30`;
  const sessionBody = {
    select_query: `select Session_Grade, LMS_Activity_ID, Explanation_Meeting_Link from Sessions where Session_Date_Time between '${formattedDateStart}' and '${formattedDateEnd}' and Session_Grade = '${gradeGroup}'`,
  };

  const session = await axios.post(
    `https://www.zohoapis.com/crm/v3/coql`,
    sessionBody,
    zohoConfig
  );

  if (session.status >= 400) {
    return {
      status: session.status,
      mode: "internalservererrorinfindingsession",
    };
  }

  // if (session.status === 204) {
  //   return {
  //     status: session.status,
  //     mode: "nosession",
  //     name,
  //     credits: credits ? credits : 0,
  //     grade: grade,
  //   };
  // }

  const attemptBody = {
    select_query: `select Session.id as Session_id, Session.Name as Session_Name,Session.Subject as Subject, Session.Number_of_Questions as Total_Questions, Session_Date_Time, Quiz_Score from Attempts where Contact_Name = '${contactid}'`,
  };

  const attempt = await axios.post(
    `https://www.zohoapis.com/crm/v3/coql`,
    attemptBody,
    zohoConfig
  );

  const finalAddress = address
    ? address
    : attempt.status === 200 && attempt.data.info.count <= 3
    ? "Temp Address"
    : null;

  const meetLink =
    !credits && session.status === 200
      ? freeMeetLink
      : session.status === 200
      ? session.data.data[0].Explanation_Meeting_Link
      : null;

  return {
    status: 200,
    mode: !gradeUpdated ? "oldData" : "zoomlink",
    email,
    link: meetLink,
    name,
    credits: credits,
    grade: grade,
    team: "not required",
    address: finalAddress,
    pincode,
  };
};

module.exports = { getMeetingLink };