(async function initializeCampuslyApp() {
let bootstrap;
try {
  bootstrap = await Campusly.api("state", null, "GET");
} catch (error) {
  console.error("Could not load the signed-in account.", error);
  if (error.status === 401) {
    window.location.replace("login.html");
  } else {
    const message = document.createElement("main");
    message.className = "startup-error";
    message.setAttribute("role", "alert");
    const heading = document.createElement("h1");
    heading.textContent = "Your sign-in is still active";
    const details = document.createElement("p");
    details.textContent = `The portal could not load its data: ${error.message} Check the PHP/MySQL server logs or database connection, then reload this page.`;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Reload portal";
    retry.addEventListener("click", () => window.location.reload());
    message.append(heading, details, retry);
    document.body.replaceChildren(message);
  }
  return;
}

const appData = bootstrap.data;
const currentUser = bootstrap.user;
if (!appData.college || !currentUser) {
  window.location.replace("login.html");
  return;
}

const currentRole = currentUser?.role || "student";
const SUBJECT_OPTIONS = ["DS", "DSTL", "Math", "Python", "TC", "COA"];
const navLinks = document.querySelectorAll(".nav-link");
const panels = document.querySelectorAll(".view-panel");
const breadcrumb = document.querySelector("#breadcrumbCurrent");
const sidebar = document.querySelector("#sidebar");
const toast = document.querySelector("#toast");
const correctionDialog = document.querySelector("#correctionDialog");
let toastTimer;

const roleDetails = {
  student: {
    name: "Arjun",
    subtitle: "Here’s what’s happening with your classes today.",
    title: "Your semester, at a glance",
    text: "Stay on top of attendance, classes and coursework — all in one place.",
    staff: false,
  },
  faculty: {
    name: "Prof. Mehta",
    subtitle: "Your classes, attendance and assessments for today.",
    title: "Welcome to your faculty workspace",
    text: "Take attendance, keep your timetable up to date and publish assessment marks.",
    staff: true,
  },
  hod: {
    name: "Dr. Rao",
    subtitle: "Your department overview and pending approvals.",
    title: "Department overview",
    text: "Review attendance corrections, follow department trends and support your faculty.",
    staff: true,
  },
  director: {
    name: "Director",
    subtitle: "A quick overview of academics across your college.",
    title: "College administration",
    text: "Monitor attendance and academic activity across departments from one workspace.",
    staff: true,
  },
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

async function refreshData() {
  const latest = await Campusly.api("state", null, "GET");
  Object.assign(appData, latest.data);
  Object.assign(currentUser, latest.user);
}

function getVisibleSections() {
  if (currentRole === "director") return appData.sections;
  if (currentRole === "hod") return appData.sections.filter((section) => section.hodEmail === currentUser.email);
  if (currentRole === "faculty") return appData.sections.filter((section) => section.department === currentUser.department);
  return appData.sections.filter((section) => section.id === currentUser.sectionId);
}

function getVisibleAttendance() {
  if (currentRole === "director") return appData.attendance;
  if (currentRole === "hod") {
    const sectionIds = new Set(getVisibleSections().map((section) => section.id));
    return appData.attendance.filter((record) => sectionIds.has(record.sectionId));
  }
  if (currentRole === "faculty") {
    const sectionIds = new Set(appData.sections.filter((section) => section.department === currentUser.department).map((section) => section.id));
    return appData.attendance.filter((record) => record.facultyEmail === currentUser.email || sectionIds.has(record.sectionId));
  }
  return appData.attendance.filter((record) => record.attendees.some((attendee) => attendee.email === currentUser.email));
}

function sectionById(sectionId) {
  return appData.sections.find((section) => section.id === sectionId);
}

function userByEmail(email, role) {
  return appData.users.find((user) => user.email === email && user.role === role);
}

function getPublishableSections() {
  const sections = getVisibleSections();
  return currentRole === "faculty"
    ? sections.filter((section) => section.mentorEmail === currentUser.email)
    : currentRole === "hod" ? sections : [];
}

function getMarkSections() {
  const sectionIds = new Set(appData.subjectOfferings
    .filter((offering) => offering.facultyEmail === currentUser.email)
    .map((offering) => offering.sectionId));
  return getVisibleSections().filter((section) => sectionIds.has(section.id));
}

function addCell(row, value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value;
  if (className) cell.className = className;
  row.append(cell);
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function countFirstLectures() {
  let attended = 0;
  let held = 0;
  getVisibleAttendance().filter((record) => record.isFirstLecture).forEach((record) => {
    const student = record.attendees.find((attendee) => attendee.email === currentUser.email);
    if (currentRole === "student") {
      if (student) {
        held += 1;
        if (student.status === "present") attended += 1;
      }
    } else {
      held += record.attendees.length;
      attended += record.attendees.filter((attendee) => attendee.status === "present").length;
    }
  });
  return { attended, held, percentage: held ? Math.round((attended / held) * 100) : null };
}

function renderDashboardAttendance() {
  const today = localDateString();
  const records = getVisibleAttendance()
    .filter((record) => record.date === today)
    .sort((a, b) => a.lectureTime.localeCompare(b.lectureTime));
  const list = document.querySelector("#dashboardLectureList");
  list.replaceChildren();
  records.forEach((record) => {
    const section = sectionById(record.sectionId);
    const ownStatus = record.attendees.find((attendee) => attendee.email === currentUser.email)?.status;
    const present = currentRole === "student"
      ? Number(ownStatus === "present")
      : record.attendees.filter((attendee) => attendee.status === "present").length;
    const total = currentRole === "student" ? 1 : record.attendees.length;
    const row = document.createElement("div");
    row.className = `lecture-dashboard-row${record.isFirstLecture ? " is-first-lecture" : ""}`;
    const order = document.createElement("span");
    order.className = "lecture-order";
    order.textContent = record.isFirstLecture ? "★" : `L${record.lectureNumber}`;
    const detail = document.createElement("div");
    detail.className = "lecture-summary";
    const subject = document.createElement("strong");
    subject.textContent = record.subject;
    const place = document.createElement("small");
    place.textContent = `${record.lectureTime} · ${section?.name || "Section"}`;
    detail.append(subject, place);
    const count = document.createElement("span");
    count.className = "lecture-attendance-count";
    count.textContent = `${present}/${total} present`;
    const type = document.createElement("span");
    type.className = `attendance-status ${record.isFirstLecture ? "caution" : "safe"}`;
    type.textContent = record.isFirstLecture ? "First lecture" : "Lecture";
    row.append(order, detail, count, type);
    list.append(row);
  });
  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "empty-accounts";
    empty.textContent = currentRole === "faculty"
      ? "No lecture records today yet. Use Lecture attendance to take attendance for each class."
      : "No lecture attendance has been recorded for today yet.";
    list.append(empty);
  }
  const first = countFirstLectures();
  document.querySelector("#firstLectureSummary").textContent =
    first.held ? `${first.attended}/${first.held} · ${first.percentage}%` : "Not recorded";

  const subjects = new Map();
  getVisibleAttendance().forEach((record) => {
    let subject = subjects.get(record.subject);
    if (!subject) {
      subject = { attended: 0, held: 0, firstAttended: 0, firstHeld: 0 };
      subjects.set(record.subject, subject);
    }
    const own = record.attendees.find((attendee) => attendee.email === currentUser.email);
    if (currentRole === "student") {
      if (own) {
        subject.held += 1;
        if (own.status === "present") subject.attended += 1;
      }
    } else {
      subject.held += record.attendees.length;
      subject.attended += record.attendees.filter((attendee) => attendee.status === "present").length;
    }
    if (record.isFirstLecture) {
      if (currentRole === "student") {
        if (own) {
          subject.firstHeld += 1;
          if (own.status === "present") subject.firstAttended += 1;
        }
      } else {
        subject.firstHeld += record.attendees.length;
        subject.firstAttended += record.attendees.filter((attendee) => attendee.status === "present").length;
      }
    }
  });
  const subjectList = document.querySelector("#dashboardSubjectAttendance");
  subjectList.replaceChildren();
  subjects.forEach((value, subject) => {
    const row = document.createElement("tr");
    const percentage = value.held ? Math.round((value.attended / value.held) * 100) : 0;
    addCell(row, subject);
    addCell(row, `${value.attended} / ${value.held}`);
    addCell(row, `${percentage}%`, percentage >= 85 ? "percent strong" : "percent low");
    addCell(row, `${value.firstAttended} / ${value.firstHeld}`);
    subjectList.append(row);
  });
}

function renderAttendanceRecords() {
  const records = getVisibleAttendance().slice().sort((a, b) =>
    `${b.date}T${b.lectureTime}`.localeCompare(`${a.date}T${a.lectureTime}`),
  );
  const table = document.querySelector("#lectureRecordList");
  table.replaceChildren();
  document.querySelector("#lectureRecordCount").textContent = `${records.length} ${records.length === 1 ? "lecture" : "lectures"}`;
  document.querySelector("#emptyLectureRecords").hidden = records.length > 0;
  const subjectCounts = new Map();
  let totalAttended = 0;
  let totalHeld = 0;
  let firstAttended = 0;
  let firstHeld = 0;
  records.forEach((record) => {
    const section = sectionById(record.sectionId);
    const studentStatus = record.attendees.find((attendee) => attendee.email === currentUser.email)?.status;
    const present = currentRole === "student"
      ? Number(studentStatus === "present")
      : record.attendees.filter((attendee) => attendee.status === "present").length;
    const total = currentRole === "student" ? 1 : record.attendees.length;
    const row = document.createElement("tr");
    addCell(row, `${record.date} · ${record.lectureTime}`);
    addCell(row, `Lecture ${record.lectureNumber}`);
    addCell(row, record.subject);
    addCell(row, section?.name || "Section");
    addCell(row, `${present} / ${total}`);
    addCell(row, record.isFirstLecture ? "★ First lecture" : "—", record.isFirstLecture ? "first-lecture-cell" : "");
    table.append(row);
    totalAttended += present;
    totalHeld += total;
    let subject = subjectCounts.get(record.subject);
    if (!subject) {
      subject = { attended: 0, held: 0, firstAttended: 0, firstHeld: 0 };
      subjectCounts.set(record.subject, subject);
    }
    subject.attended += present;
    subject.held += total;
    if (record.isFirstLecture) {
      firstAttended += present;
      firstHeld += total;
      subject.firstAttended += present;
      subject.firstHeld += total;
    }
  });
  const firstPercent = firstHeld ? Math.round((firstAttended / firstHeld) * 100) : null;
  const allPercent = totalHeld ? Math.round((totalAttended / totalHeld) * 100) : null;
  document.querySelector("#attendanceFirstLecturePercent").textContent = firstPercent === null ? "—" : `${firstPercent}%`;
  document.querySelector("#attendanceFirstLectureCount").textContent = firstHeld ? `${firstAttended} / ${firstHeld} first-lecture attendances` : "No first-lecture records yet";
  document.querySelector("#attendanceAllLecturePercent").textContent = allPercent === null ? "—" : `${allPercent}%`;
  document.querySelector("#attendanceAllLectureCount").textContent = totalHeld ? `${totalAttended} / ${totalHeld} lecture attendances` : "No lecture records yet";
  if (currentRole === "student") {
    document.querySelector("#studentFirstLecturePercent").textContent = firstPercent === null ? "—" : `${firstPercent}%`;
    document.querySelector("#studentFirstLectureCount").textContent = firstHeld ? `${firstAttended} / ${firstHeld} first lectures attended` : "First lecture is counted separately";
    document.querySelector("#studentFirstLectureBar").style.width = `${firstPercent || 0}%`;
    document.querySelector("#studentLecturePercent").textContent = allPercent === null ? "—" : `${allPercent}%`;
    document.querySelector("#studentLectureCount").textContent = totalHeld ? `${totalAttended} / ${totalHeld} lectures attended` : "Every subject lecture counts";
  } else {
    document.querySelector("#staffFirstLecturePercent").textContent = firstPercent === null ? "—" : `${firstPercent}%`;
    document.querySelector("#staffFirstLectureCount").textContent = firstHeld ? `${firstAttended} / ${firstHeld} first-lecture attendances` : "First lectures counted separately";
    document.querySelector("#staffFirstLectureBar").style.width = `${firstPercent || 0}%`;
    document.querySelector("#staffLecturesToday").textContent = String(records.filter((record) => record.date === localDateString()).length);
    const pendingLeaves = appData.leaves.filter((leave) => {
      if (currentRole === "faculty") return leave.mentorEmail === currentUser.email && leave.status === "mentor-review";
      if (currentRole === "hod") return leave.hodEmail === currentUser.email && leave.status === "hod-review";
      return ["mentor-review", "hod-review"].includes(leave.status);
    }).length;
    document.querySelector("#staffPendingLeaves").textContent = String(pendingLeaves);
    document.querySelector("#staffLeaveStatus").textContent = currentRole === "faculty" ? "Family contact before forwarding" : "Final HoD decision after mentor";
    document.querySelector("#staffSectionCount").textContent = String(getVisibleSections().length);
  }
  const subjectList = document.querySelector("#subjectAttendanceList");
  subjectList.replaceChildren();
  document.querySelector("#emptySubjectAttendance").hidden = subjectCounts.size > 0;
  subjectCounts.forEach((counts, subject) => {
    const row = document.createElement("tr");
    const percent = counts.held ? Math.round((counts.attended / counts.held) * 100) : 0;
    addCell(row, subject);
    addCell(row, `${counts.attended} / ${counts.held}`);
    addCell(row, `${percent}%`, percent >= 85 ? "percent strong" : "percent low");
    addCell(row, `${counts.firstAttended} / ${counts.firstHeld}`);
    subjectList.append(row);
  });
  renderStudentSubjectPieCharts(subjectCounts);
}

function renderStudentSubjectPieCharts(subjectCounts) {
  const charts = document.querySelector("#studentSubjectPieCharts");
  charts.replaceChildren();
  if (currentRole !== "student") return;
  const subjects = new Set(
    appData.subjectOfferings
      .filter((offering) => offering.sectionId === currentUser.sectionId)
      .map((offering) => offering.subject),
  );
  subjectCounts.forEach((_counts, subject) => subjects.add(subject));
  if (!subjects.size) {
    const empty = document.createElement("p");
    empty.className = "empty-accounts";
    empty.textContent = "Your HoD has not added subjects to your section yet.";
    charts.append(empty);
    return;
  }
  subjects.forEach((subject) => {
    const counts = subjectCounts.get(subject) || { attended: 0, held: 0 };
    const percentage = counts.held ? Math.round((counts.attended / counts.held) * 100) : null;
    const card = document.createElement("article");
    card.className = "subject-pie-card";
    const ring = document.createElement("div");
    ring.className = "subject-pie-ring";
    ring.setAttribute("role", "img");
    ring.setAttribute("aria-label", `${subject}: ${percentage === null ? "no attendance recorded" : `${percentage}% attendance`}`);
    ring.style.setProperty("--attendance-angle", `${(percentage || 0) * 3.6}deg`);
    const value = document.createElement("strong");
    value.textContent = percentage === null ? "—" : `${percentage}%`;
    ring.append(value);
    const name = document.createElement("strong");
    name.className = "subject-pie-name";
    name.textContent = subject;
    const total = document.createElement("small");
    total.textContent = counts.held ? `${counts.attended} of ${counts.held} lectures attended` : "No lectures recorded yet";
    card.append(ring, name, total);
    charts.append(card);
  });
}

function renderStudentProfile() {
  if (currentRole !== "student") return;
  const section = sectionById(currentUser.sectionId);
  const mentor = userByEmail(section?.mentorEmail, "faculty");
  const hod = userByEmail(section?.hodEmail, "hod");
  document.querySelector("#profileStudentName").textContent = currentUser.name;
  document.querySelector("#profileStudentRollNumber").textContent = currentUser.rollNumber || "Not recorded";
  document.querySelector("#profileStudentDob").textContent = formatDisplayDate(currentUser.dateOfBirth);
  document.querySelector("#profileStudentFather").textContent = currentUser.fatherName || "Not recorded";
  document.querySelector("#profileDepartment").textContent = currentUser.department || "Not assigned";
  document.querySelector("#profileSection").textContent = section ? `${section.course} · ${section.name}` : "Not assigned";
  document.querySelector("#profileMentor").textContent = mentor?.name || "Not assigned";
  document.querySelector("#profileHod").textContent = hod?.name || "Not assigned";
}

function formatDisplayDate(date) {
  if (!date) return "Not recorded";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function renderNotices() {
  const list = document.querySelector("#noticeList");
  list.replaceChildren();
  document.querySelector("#emptyNotices").hidden = appData.notices.length > 0;
  document.querySelector("#noticeNavCount").textContent = String(appData.notices.length);
  appData.notices.forEach((notice) => {
    const card = document.createElement("article");
    card.className = "notice-card";
    const top = document.createElement("div");
    top.className = "notice-card-top";
    const category = document.createElement("span");
    category.className = `notice-tag tag-${notice.category}`;
    category.textContent = notice.category.toUpperCase();
    const date = document.createElement("time");
    date.textContent = new Date(`${notice.createdAt.replace(" ", "T")}Z`).toLocaleString();
    top.append(category, date);
    const title = document.createElement("h2");
    title.textContent = notice.title;
    const body = document.createElement("p");
    body.textContent = notice.body;
    const author = document.createElement("span");
    author.className = "notice-author";
    author.textContent = `Posted by ${notice.authorName}${notice.department ? ` · ${notice.department}` : " · All college"}`;
    card.append(top, title, body, author);
    list.append(card);
  });

  const preview = document.querySelector("#dashboardNoticePreview");
  preview.replaceChildren();
  appData.notices.slice(0, 2).forEach((notice) => {
    const row = document.createElement("div");
    row.className = "notice-row";
    const category = document.createElement("span");
    category.className = `notice-tag tag-${notice.category}`;
    category.textContent = notice.category.toUpperCase();
    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = notice.title;
    const details = document.createElement("p");
    details.textContent = `${notice.authorName} · ${notice.department || "All college"}`;
    content.append(title, details);
    const arrow = document.createElement("span");
    arrow.className = "notice-arrow";
    arrow.textContent = "↗";
    row.append(category, content, arrow);
    preview.append(row);
  });
  if (!preview.childElementCount) {
    const empty = document.createElement("p");
    empty.className = "empty-accounts";
    empty.textContent = "No notices have been published yet.";
    preview.append(empty);
  }
}

function renderTimetable() {
  const entries = appData.timetable;
  const table = document.querySelector("#timetableList");
  table.replaceChildren();
  document.querySelector("#emptyTimetable").hidden = entries.length > 0;
  entries.forEach((entry) => {
    const row = document.createElement("tr");
    [
      weekdayNames[entry.weekday - 1],
      `${entry.startTime} – ${entry.endTime}`,
      entry.subject,
      entry.facultyName,
      entry.room,
      entry.sectionName,
    ].forEach((value) => addCell(row, value));
    table.append(row);
  });
  const section = sectionById(currentUser.sectionId);
  document.querySelector("#timetableSectionName").textContent =
    currentRole === "student" ? section?.name || "SECTION PENDING" : "PUBLISHED CLASSES";

  const today = (new Date().getDay() + 6) % 7 + 1;
  const todaysEntries = entries.filter((entry) => entry.weekday === today);
  [document.querySelector("#dashboardTimetablePreview"), document.querySelector("#dashboardTimetablePreviewSecondary")]
    .forEach((timeline) => {
      timeline.replaceChildren();
      todaysEntries.slice(0, 4).forEach((entry, index) => {
        const item = document.createElement("div");
        item.className = `timeline-item${index === 0 ? " current" : ""}`;
        const time = document.createElement("div");
        time.className = "time";
        time.textContent = entry.startTime;
        const end = document.createElement("small");
        end.textContent = entry.endTime;
        time.append(end);
        const line = document.createElement("span");
        line.className = "timeline-line";
        const info = document.createElement("div");
        info.className = "class-info";
        const subject = document.createElement("strong");
        subject.textContent = entry.subject;
        const details = document.createElement("small");
        details.textContent = `${entry.room} · ${entry.facultyName}`;
        info.append(subject, details);
        const label = document.createElement("span");
        label.className = `class-status${index === 0 ? " live" : ""}`;
        label.textContent = `L${index + 1}`;
        item.append(time, line, info, label);
        timeline.append(item);
      });
      if (!todaysEntries.length) {
        const empty = document.createElement("p");
        empty.className = "empty-accounts";
        empty.textContent = "No classes are scheduled for today.";
        timeline.append(empty);
      }
    });
}

function renderAssignmentsAndMarks() {
  const upcomingAssignments = appData.assignments
    .filter((assignment) => assignment.dueDate >= localDateString())
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  document.querySelector("#studentAssignmentsDue").textContent = String(upcomingAssignments.length);
  document.querySelector("#studentAssignmentsFoot").textContent = "Published for your section";
  document.querySelector("#studentAssignmentNote").textContent = upcomingAssignments.length
    ? `Next: ${upcomingAssignments[0].title} · ${upcomingAssignments[0].dueDate}`
    : "No upcoming assignments";

  const assignments = document.querySelector("#assignmentList");
  assignments.replaceChildren();
  document.querySelector("#emptyAssignments").hidden = appData.assignments.length > 0;
  appData.assignments.forEach((assignment) => {
    const row = document.createElement("tr");
    const title = document.createElement("td");
    const strong = document.createElement("strong");
    strong.textContent = assignment.title;
    title.append(strong);
    if (assignment.description) {
      const description = document.createElement("small");
      description.className = "table-secondary-text";
      description.textContent = assignment.description;
      title.append(description);
    }
    row.append(title);
    [assignment.subject, assignment.sectionName, assignment.dueDate].forEach((value) => addCell(row, value));
    const instructions = document.createElement("td");
    instructions.textContent = assignment.authorName;
    row.append(instructions);
    assignments.append(row);
  });

  const marks = document.querySelector("#marksList");
  marks.replaceChildren();
  document.querySelector("#emptyMarks").hidden = appData.marks.length > 0;
  const average = appData.marks.length
    ? Math.round(appData.marks.reduce((total, mark) => total + mark.score / mark.maxScore * 100, 0) / appData.marks.length)
    : null;
  document.querySelector("#studentAverageMarks").textContent = average === null ? "—" : String(average);
  document.querySelector("#studentAverageUnit").hidden = average === null;
  document.querySelector("#studentMarksNote").textContent = appData.marks.length
    ? `${appData.marks.length} published ${appData.marks.length === 1 ? "assessment" : "assessments"}`
    : "No assessment marks available";
  appData.marks.forEach((mark) => {
    const row = document.createElement("tr");
    [
      mark.assessmentType === "assignment" ? "Assignment" : "Class test",
      mark.subject,
      mark.assessment,
      mark.testDate,
      currentRole === "student" ? currentUser.name : `${mark.studentName} · ${mark.sectionName}`,
      `${mark.score} / ${mark.maxScore}`,
      `${Math.round((mark.score / mark.maxScore) * 100)}%`,
    ].forEach((value) => addCell(row, value));
    marks.append(row);
  });
}

function configurePublishingForms() {
  const publishableSections = getPublishableSections();
  const markSections = currentRole === "faculty" ? getMarkSections() : [];
  document.querySelector("#noticePublishPanel").hidden = !["director", "hod"].includes(currentRole);
  document.querySelector("#noticeDepartmentField").hidden = currentRole !== "director";
  document.querySelector("#timetablePublishPanel").hidden = !["hod", "faculty"].includes(currentRole);
  document.querySelector("#assignmentPublishPanel").hidden = currentRole !== "faculty";
  document.querySelector("#markPublishPanel").hidden = currentRole !== "faculty";

  [
    ["timetableForm", publishableSections],
    ["assignmentForm", publishableSections],
    ["markForm", markSections],
  ].forEach(([formId, sections]) => {
    const select = document.querySelector(`#${formId}`).elements.section;
    const currentValue = select.value;
    select.replaceChildren(new Option(sections.length ? "Select a section" : "No section assigned", ""));
    sections.forEach((section) => select.add(new Option(section.name, section.id)));
    if (sections.some((section) => section.id === currentValue)) select.value = currentValue;
  });

  const departmentSelect = document.querySelector("#noticeForm").elements.department;
  const selectedDepartment = departmentSelect.value;
  const departments = [...new Set(appData.users.filter((user) => user.role === "hod").map((user) => user.department).filter(Boolean))];
  departmentSelect.replaceChildren(new Option("All college", ""));
  departments.forEach((department) => departmentSelect.add(new Option(department, department)));
  departmentSelect.value = departments.includes(selectedDepartment) ? selectedDepartment : "";

  const teacherField = document.querySelector("#timetableForm").elements.facultyName;
  if (currentRole === "faculty" && !teacherField.value) teacherField.value = currentUser.name;
  renderMarkStudentOptions();
  renderMarkSubjectOptions();
}

function renderMarkStudentOptions() {
  const markForm = document.querySelector("#markForm");
  const selectedSection = sectionById(markForm.elements.section.value);
  const studentSelect = markForm.elements.student;
  const selectedStudent = studentSelect.value;
  const sectionStudents = appData.users.filter((user) =>
    user.role === "student" && user.sectionId === selectedSection?.id,
  );
  studentSelect.replaceChildren(new Option(sectionStudents.length ? "Select a student" : "Select a section first", ""));
  sectionStudents.forEach((student) => studentSelect.add(new Option(student.name, String(student.id))));
  if (sectionStudents.some((student) => String(student.id) === selectedStudent)) studentSelect.value = selectedStudent;
}

function renderMarkSubjectOptions() {
  const form = document.querySelector("#markForm");
  const sectionId = form.elements.section.value;
  const selectedSubject = form.elements.subject.value;
  const subjects = appData.subjectOfferings.filter((offering) =>
    offering.sectionId === sectionId && offering.facultyEmail === currentUser.email,
  );
  form.elements.subject.replaceChildren(new Option(subjects.length ? "Select a subject" : "Select a section first", ""));
  subjects.forEach((offering) => form.elements.subject.add(new Option(offering.subject, offering.subject)));
  if (subjects.some((offering) => offering.subject === selectedSubject)) {
    form.elements.subject.value = selectedSubject;
  }
}

function renderLectureRoster() {
  const sectionId = document.querySelector("#lectureAttendanceForm").elements.section.value;
  const section = sectionById(sectionId);
  const subjectSelect = document.querySelector("#lectureAttendanceForm").elements.subject;
  const currentSubject = subjectSelect.value;
  const subjects = appData.subjectOfferings.filter((offering) =>
    offering.sectionId === sectionId && offering.facultyEmail === currentUser.email,
  );
  subjectSelect.replaceChildren(new Option(subjects.length ? "Select an assigned subject" : "No subject assigned to you", ""));
  subjects.forEach((offering) => subjectSelect.add(new Option(offering.subject, offering.subject)));
  if (subjects.some((offering) => offering.subject === currentSubject)) subjectSelect.value = currentSubject;
  const roster = document.querySelector("#lectureRoster");
  roster.replaceChildren();
  const students = appData.users.filter((user) => user.role === "student" && user.sectionId === sectionId);
  if (!section || !students.length) {
    const empty = document.createElement("p");
    empty.className = "empty-accounts";
    empty.textContent = section ? "No students are assigned to this section yet." : "Select a section to load its student roster.";
    roster.append(empty);
    return;
  }
  students.forEach((student) => {
    const label = document.createElement("label");
    label.className = "roster-student";
    const name = document.createElement("span");
    name.textContent = student.name;
    const select = document.createElement("select");
    select.name = `attendance-${student.email}`;
    select.setAttribute("aria-label", `Attendance for ${student.name}`);
    select.add(new Option("Present", "present"));
    select.add(new Option("Absent", "absent"));
    label.append(name, select);
    roster.append(label);
  });
}

function renderSections() {
  const visible = getVisibleSections();
  const table = document.querySelector("#sectionList");
  table.replaceChildren();
  document.querySelector("#emptySections").hidden = visible.length > 0;
  visible.forEach((section) => {
    const row = document.createElement("tr");
    const mentor = userByEmail(section.mentorEmail, "faculty");
    const students = appData.users.filter((user) => user.role === "student" && user.sectionId === section.id).length;
    [section.name, section.course, mentor?.name || "Mentor not assigned", String(students)]
      .forEach((value) => addCell(row, value));
    table.append(row);
  });

  const dashboardList = document.querySelector("#dashboardSectionList");
  dashboardList.replaceChildren();
  visible.slice(0, 5).forEach((section) => {
    const mentor = userByEmail(section.mentorEmail, "faculty");
    const row = document.createElement("div");
    row.className = "dashboard-section-row";
    const chip = document.createElement("span");
    chip.className = "section-chip";
    chip.textContent = section.name.slice(0, 2).toUpperCase();
    const detail = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = section.name;
    const course = document.createElement("small");
    course.textContent = section.course;
    detail.append(name, course);
    const mentorName = document.createElement("span");
    mentorName.className = "section-mentor-name";
    mentorName.textContent = mentor?.name || "No mentor";
    row.append(chip, detail, mentorName);
    dashboardList.append(row);
  });
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty-accounts";
    empty.textContent = currentRole === "student"
      ? "Your section has not been assigned yet."
      : currentRole === "faculty"
        ? "No section is assigned to you as mentor yet."
        : "Create sections and assign a faculty mentor to each one.";
    dashboardList.append(empty);
  }

  const mentorSelect = document.querySelector("#createSectionForm").elements.mentor;
  const mentors = appData.users.filter((user) => user.role === "faculty" && user.department === currentUser.department);
  mentorSelect.replaceChildren(new Option(mentors.length ? "Select a faculty mentor" : "Create faculty accounts first", ""));
  mentors.forEach((mentor) => mentorSelect.add(new Option(`${mentor.name} · ${mentor.email}`, mentor.email)));
  const sectionSelect = document.querySelector("#assignStudentForm").elements.section;
  sectionSelect.replaceChildren(new Option(visible.length ? "Select a section" : "Create a section first", ""));
  visible.forEach((section) => sectionSelect.add(new Option(section.name, section.id)));
  const studentsSelect = document.querySelector("#assignStudentForm").elements.student;
  const students = appData.users.filter((user) => user.role === "student" && user.department === currentUser.department);
  studentsSelect.replaceChildren(new Option(students.length ? "Select a student" : "No student accounts found", ""));
  students.forEach((student) => {
    const section = sectionById(student.sectionId);
    studentsSelect.add(new Option(`${student.name} · ${section?.name || "Unassigned"}`, student.email));
  });

  const mentorSections = currentRole === "faculty" ? getPublishableSections() : [];
  populateStudentSectionOptions("#createStudentForm", visible);
  populateStudentSectionOptions("#directorStudentForm", visible);
  populateStudentSectionOptions("#mentorStudentForm", mentorSections);
  const mentorStudentList = document.querySelector("#mentorStudentList");
  mentorStudentList.replaceChildren();
  const mentorSectionIds = new Set(mentorSections.map((section) => section.id));
  const mentorStudents = appData.users.filter((user) =>
    user.role === "student" && mentorSectionIds.has(user.sectionId),
  );
  document.querySelector("#emptyMentorStudents").hidden = mentorStudents.length > 0;
  mentorStudents.forEach((student) => {
    const row = document.createElement("tr");
    const section = sectionById(student.sectionId);
    [
      student.name,
      student.rollNumber || "—",
      formatDisplayDate(student.dateOfBirth),
      student.fatherName || "—",
      section?.name || "—",
    ].forEach((value) => addCell(row, value));
    appendAccountActions(row, student);
    mentorStudentList.append(row);
  });

  const attendanceSection = document.querySelector("#lectureAttendanceForm").elements.section;
  const facultyOfferings = appData.subjectOfferings.filter((offering) => offering.facultyEmail === currentUser.email);
  const facultySectionIds = new Set(facultyOfferings.map((offering) => offering.sectionId));
  const facultySections = visible.filter((section) => facultySectionIds.has(section.id));
  const selectedAttendanceSection = attendanceSection.value;
  attendanceSection.replaceChildren(new Option(facultySections.length ? "Select a section" : "No section assigned", ""));
  facultySections.forEach((section) => attendanceSection.add(new Option(section.name, section.id)));
  if (facultySections.some((section) => section.id === selectedAttendanceSection)) attendanceSection.value = selectedAttendanceSection;
  renderSubjectOfferingControls(visible);
  renderLectureRoster();
}

function renderSubjectOfferingControls(sections) {
  const choices = document.querySelector("#subjectOfferingChoices");
  const selected = new Set(
    [...choices.querySelectorAll("input:checked")].map((input) => `${input.dataset.subject}:${input.value}`),
  );
  choices.replaceChildren();
  const availableSections = sections.filter((section) => section.hodEmail === currentUser.email);
  SUBJECT_OPTIONS.forEach((subject) => {
    const group = document.createElement("fieldset");
    group.className = "subject-offering-group";
    const legend = document.createElement("legend");
    legend.textContent = subject;
    const sectionList = document.createElement("div");
    sectionList.className = "subject-section-options";
    availableSections.forEach((section) => {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = section.id;
      checkbox.dataset.subject = subject;
      checkbox.checked = selected.has(`${subject}:${section.id}`)
        || appData.subjectOfferings.some((offering) => offering.sectionId === section.id && offering.subject === subject);
      const name = document.createElement("span");
      name.textContent = section.name;
      label.append(checkbox, name);
      sectionList.append(label);
    });
    if (!availableSections.length) {
      const empty = document.createElement("small");
      empty.textContent = "Create a section first.";
      sectionList.append(empty);
    }
    group.append(legend, sectionList);
    choices.append(group);
  });

  const assignmentList = document.querySelector("#subjectFacultyAssignments");
  assignmentList.replaceChildren();
  const faculty = appData.users.filter((account) =>
    account.role === "faculty" && account.department === currentUser.department,
  );
  const offerings = appData.subjectOfferings.filter((offering) =>
    availableSections.some((section) => section.id === offering.sectionId),
  );
  document.querySelector("#emptySubjectFacultyAssignments").hidden = offerings.length > 0;
  offerings.forEach((offering) => {
    const row = document.createElement("tr");
    addCell(row, offering.sectionName);
    addCell(row, offering.subject);
    const facultyCell = document.createElement("td");
    const select = document.createElement("select");
    select.className = "subject-faculty-select";
    select.setAttribute("aria-label", `Faculty for ${offering.subject} in ${offering.sectionName}`);
    select.add(new Option(faculty.length ? "Select faculty" : "Create faculty accounts first", ""));
    faculty.forEach((account) => select.add(new Option(account.name, String(account.id))));
    if (offering.facultyId !== null) select.value = String(offering.facultyId);
    facultyCell.append(select);
    row.append(facultyCell);
    row.dataset.sectionId = offering.sectionId;
    row.dataset.subject = offering.subject;
    assignmentList.append(row);
  });
}

function populateStudentSectionOptions(formSelector, sections) {
  const select = document.querySelector(formSelector).elements.section;
  const selected = select.value;
  select.replaceChildren(new Option(sections.length ? "Select a section" : "No section available", ""));
  sections.forEach((section) => select.add(new Option(section.name, section.id)));
  if (sections.some((section) => section.id === selected)) select.value = selected;
}

function setLeaveMessage(form, message, success = false) {
  const output = form.querySelector(".account-message");
  output.textContent = message;
  output.classList.toggle("success", success);
  output.hidden = false;
}

function visibleLeaveRequests() {
  if (currentRole === "student") return appData.leaves.filter((leave) => leave.studentEmail === currentUser.email);
  if (currentRole === "faculty") {
    return appData.leaves.filter((leave) => leave.mentorEmail === currentUser.email && leave.status === "mentor-review");
  }
  if (currentRole === "hod") {
    return appData.leaves.filter((leave) => leave.hodEmail === currentUser.email);
  }
  return appData.leaves;
}

function renderLeaveRequests() {
  const requests = visibleLeaveRequests().slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const list = document.querySelector("#leaveRequestList");
  list.replaceChildren();
  document.querySelector("#emptyLeaveRequests").hidden = requests.length > 0;
  const statusLabels = {
    "mentor-review": "Awaiting mentor",
    "hod-review": "Awaiting HoD",
    approved: "Approved",
    rejected: "Rejected",
  };
  requests.forEach((leave) => {
    const section = sectionById(leave.sectionId);
    const student = userByEmail(leave.studentEmail, "student");
    const card = document.createElement("article");
    card.className = "leave-request-card";
    const statusClass = leave.status === "approved" ? "status-approved" : leave.status === "rejected" ? "status-rejected" : "status-pending";
    const heading = document.createElement("div");
    heading.className = "leave-card-heading";
    const headingInfo = document.createElement("div");
    const studentName = document.createElement("strong");
    studentName.textContent = student?.name || leave.studentEmail;
    const dates = document.createElement("small");
    dates.textContent = `${section?.name || "Section pending"} · ${leave.fromDate} to ${leave.toDate}`;
    headingInfo.append(studentName, dates);
    const status = document.createElement("span");
    status.className = statusClass;
    status.textContent = statusLabels[leave.status] || leave.status;
    heading.append(headingInfo, status);
    card.append(heading);
    const reason = document.createElement("p");
    reason.className = "leave-reason";
    reason.textContent = leave.reason;
    card.append(reason);
    const guardian = document.createElement("div");
    guardian.className = "guardian-details";
    guardian.textContent = `Family contact: ${leave.guardianName} (${leave.guardianRelation}) · ${leave.guardianPhone}`;
    card.append(guardian);

    if (currentRole === "faculty" && leave.status === "mentor-review") {
      const contactForm = document.createElement("form");
      contactForm.className = "mentor-contact-form";
      const confirmLabel = document.createElement("label");
      confirmLabel.className = "contact-confirm";
      const confirmation = document.createElement("input");
      confirmation.name = "confirmed";
      confirmation.type = "checkbox";
      confirmation.required = true;
      confirmLabel.append(confirmation, document.createTextNode(" I spoke with the parent / guardian / family member"));
      const notesLabel = document.createElement("label");
      notesLabel.textContent = "Contact result / notes";
      const notesInput = document.createElement("textarea");
      notesInput.name = "contactNotes";
      notesInput.rows = 2;
      notesInput.maxLength = 240;
      notesInput.placeholder = "Record who you spoke with and the confirmation";
      notesInput.required = true;
      notesLabel.append(notesInput);
      const forwardButton = document.createElement("button");
      forwardButton.className = "button button-primary";
      forwardButton.type = "submit";
      forwardButton.textContent = "Forward to HoD for final approval";
      const formMessage = document.createElement("p");
      formMessage.className = "account-message";
      formMessage.setAttribute("role", "status");
      formMessage.hidden = true;
      contactForm.append(confirmLabel, notesLabel, forwardButton, formMessage);
      contactForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const notes = contactForm.elements.contactNotes.value.trim();
        if (!contactForm.elements.confirmed.checked || !notes) return;
        const button = contactForm.querySelector("button");
        button.disabled = true;
        try {
          await Campusly.api("forward-leave", { leaveId: leave.id, mentorNotes: notes });
          await refreshData();
          renderAllData();
          showToast("Family contact recorded. Leave request forwarded to HoD.");
        } catch (error) {
          formMessage.textContent = error.message;
          formMessage.hidden = false;
        } finally {
          button.disabled = false;
        }
      });
      card.append(contactForm);
    } else if (currentRole === "hod" && leave.status === "hod-review") {
      const mentorNotes = document.createElement("p");
      mentorNotes.className = "mentor-notes";
      const contactedAt = leave.mentorContactedAt ? new Date(leave.mentorContactedAt).toLocaleString() : "contact recorded";
      mentorNotes.textContent = `Mentor report (${contactedAt}): ${leave.mentorNotes || ""}`;
      card.append(mentorNotes);
      const actions = document.createElement("div");
      actions.className = "leave-decision-actions";
      ["approved", "rejected"].forEach((decision) => {
        const button = document.createElement("button");
        button.className = decision === "approved" ? "button button-primary" : "button button-outline";
        button.type = "button";
        button.textContent = decision === "approved" ? "Give final approval" : "Reject request";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await Campusly.api("decide-leave", { leaveId: leave.id, decision });
            await refreshData();
            renderAllData();
            showToast(`Leave request ${decision}.`);
          } catch (error) {
            button.disabled = false;
            showToast(error.message);
          }
        });
        actions.append(button);
      });
      card.append(actions);
    } else if (leave.mentorNotes) {
      const notes = document.createElement("p");
      notes.className = "mentor-notes";
      notes.textContent = `Mentor family contact: ${leave.mentorNotes}`;
      card.append(notes);
    }
    list.append(card);
  });
  const count = currentRole === "faculty"
    ? appData.leaves.filter((leave) => leave.mentorEmail === currentUser.email && leave.status === "mentor-review").length
    : currentRole === "hod"
      ? appData.leaves.filter((leave) => leave.hodEmail === currentUser.email && leave.status === "hod-review").length
      : currentRole === "director"
        ? appData.leaves.filter((leave) => leave.status === "hod-review").length
        : appData.leaves.filter((leave) => leave.studentEmail === currentUser.email && leave.status === "mentor-review").length;
  const badge = document.querySelector("#leaveNavCount");
  badge.textContent = String(count);
  badge.hidden = count === 0;

  const dashboardList = document.querySelector("#dashboardLeaveList");
  dashboardList.replaceChildren();
  requests.slice(0, 3).forEach((leave) => {
    const student = userByEmail(leave.studentEmail, "student");
    const item = document.createElement("div");
    item.className = "dashboard-leave-row";
    const avatar = document.createElement("span");
    avatar.className = "leave-avatar";
    avatar.textContent = (student?.name || "S").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    const detail = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = student?.name || leave.studentEmail;
    const date = document.createElement("small");
    date.textContent = `${leave.fromDate} · ${leave.reason}`;
    detail.append(name, date);
    const leaveStatus = document.createElement("span");
    leaveStatus.className = leave.status === "approved" ? "status-approved" : leave.status === "rejected" ? "status-rejected" : "status-pending";
    leaveStatus.textContent = statusLabels[leave.status] || leave.status;
    item.append(avatar, detail, leaveStatus);
    dashboardList.append(item);
  });
  if (!requests.length) {
    const empty = document.createElement("p");
    empty.className = "empty-accounts";
    empty.textContent = currentRole === "student" ? "No leave request submitted yet." : "No leave requests need your attention.";
    dashboardList.append(empty);
  }
}

function renderCorrectionRequests() {
  const list = document.querySelector("#correctionList");
  list.replaceChildren();
  const corrections = appData.corrections.slice().sort((a, b) => b.date.localeCompare(a.date));
  corrections.forEach((correction) => {
    const request = document.createElement("div");
    request.className = "request-row";
    const date = new Date(`${correction.date}T00:00:00`);
    const requestDate = document.createElement("div");
    requestDate.className = "request-date";
    const day = document.createElement("strong");
    day.textContent = date.toLocaleDateString("en-IN", { day: "2-digit" });
    const month = document.createElement("small");
    month.textContent = date.toLocaleDateString("en-IN", { month: "short" }).toUpperCase();
    requestDate.append(day, month);

    const copy = document.createElement("div");
    copy.className = "request-copy";
    const title = document.createElement("strong");
    title.textContent = `${correction.subject} · ${correction.lectureTime}`;
    const reason = document.createElement("small");
    const student = userByEmail(correction.studentEmail, "student");
    reason.textContent = `${student?.name || correction.studentEmail} · ${correction.reason}`;
    copy.append(title, reason);

    const status = document.createElement("span");
    status.className = correction.status === "approved" ? "status-approved" : correction.status === "rejected" ? "status-rejected" : "status-pending";
    status.textContent = correction.status === "hod-review" ? "Pending HoD" : correction.status === "approved" ? "Approved" : "Rejected";
    request.append(requestDate, copy, status);
    if (currentRole === "hod" && correction.status === "hod-review") {
      const actions = document.createElement("div");
      actions.className = "approval-actions";
      ["approved", "rejected"].forEach((decision) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = decision === "approved" ? "Approve" : "Reject";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await Campusly.api("decide-correction", { correctionId: correction.id, decision });
            await refreshData();
            renderAllData();
            showToast(`Attendance correction ${decision}.`);
          } catch (error) {
            button.disabled = false;
            showToast(error.message);
          }
        });
        actions.append(button);
      });
      request.append(actions);
    }
    list.append(request);
  });
  if (!corrections.length) {
    const empty = document.createElement("p");
    empty.className = "empty-accounts";
    empty.textContent = currentRole === "hod" ? "No attendance corrections await your decision." : "No attendance correction requests yet.";
    list.append(empty);
  }
}

function renderAllData() {
  populateAccountList();
  configurePublishingForms();
  renderStudentDeletionRequests();
  renderStudentProfile();
  renderSections();
  renderDashboardAttendance();
  renderAttendanceRecords();
  renderLeaveRequests();
  renderCorrectionRequests();
  renderNotices();
  renderTimetable();
  renderAssignmentsAndMarks();
}

function changeView(viewName) {
  panels.forEach((panel) => panel.classList.toggle("active", panel.id === `view-${viewName}`));
  navLinks.forEach((link) => link.classList.toggle("active", link.dataset.view === viewName));
  const viewLabels = {
    dashboard: "Dashboard",
    attendance: "Attendance",
    timetable: "Timetable",
    notices: "Notice board",
    marks: "Assignments & marks",
    leaves: "Leave requests",
    management: "People & access",
  };
  breadcrumb.textContent = viewName === "management" && currentRole === "faculty" && getPublishableSections().length
    ? "My students"
    : viewLabels[viewName] || "Dashboard";
  sidebar.classList.remove("open");
  if (viewName === "management") renderSections();
  if (viewName === "attendance") renderAttendanceRecords();
  if (viewName === "leaves") renderLeaveRequests();
  if (viewName === "leaves" && currentRole === "student") {
    document.querySelector("#studentLeaveFormPanel").hidden = false;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function populateAccountList() {
  const allowedRoles = currentRole === "director" ? ["hod", "faculty", "student"] : ["faculty", "student"];
  const accounts = appData.users.filter((user) =>
    allowedRoles.includes(user.role) &&
    (currentRole !== "hod" || user.department === currentUser.department),
  );
  const list = document.querySelector("#accountList");
  list.replaceChildren();
  document.querySelector("#emptyAccounts").hidden = accounts.length > 0;
  accounts.forEach((account) => {
    const row = document.createElement("tr");
    const login = account.role === "student" ? account.rollNumber || "—" : account.email;
    const roleLabel = { hod: "Head of Department", faculty: "Faculty", student: "Student" }[account.role];
    [account.name, login, roleLabel, account.department || "—"]
      .forEach((value) => addCell(row, value));
    appendAccountActions(row, account);
    list.append(row);
  });
}

function renderStudentDeletionRequests() {
  const requests = appData.studentDeletionRequests || [];
  const mentorList = document.querySelector("#mentorDeletionRequestList");
  mentorList.replaceChildren();
  document.querySelector("#emptyMentorDeletionRequests").hidden =
    currentRole !== "faculty" || requests.length > 0;
  if (currentRole === "faculty") {
    requests.forEach((request) => {
      const card = document.createElement("article");
      card.className = "leave-request-card";
      const title = document.createElement("strong");
      title.textContent = `${request.studentName} · ${request.studentRollNumber}`;
      const detail = document.createElement("p");
      detail.textContent = `${request.sectionName} · ${request.status === "pending" ? "Awaiting HoD approval" : `Request ${request.status}`}`;
      card.append(title, detail);
      mentorList.append(card);
    });
  }

  const approvalPanel = document.querySelector("#deletionApprovalPanel");
  approvalPanel.hidden = currentRole !== "hod";
  const approvalList = document.querySelector("#deletionApprovalList");
  approvalList.replaceChildren();
  document.querySelector("#emptyDeletionApprovals").hidden =
    currentRole !== "hod" || requests.length > 0;
  if (currentRole !== "hod") return;
  requests.forEach((request) => {
    const card = document.createElement("article");
    card.className = "leave-request-card";
    const title = document.createElement("strong");
    title.textContent = `${request.studentName} · ${request.studentRollNumber}`;
    const detail = document.createElement("p");
    detail.textContent = `Section: ${request.sectionName} · Mentor: ${request.mentorName}`;
    const warning = document.createElement("p");
    warning.textContent = "Approval permanently deletes this student and their attendance, marks, leave and correction records.";
    card.append(title, detail, warning);
    const actions = document.createElement("div");
    actions.className = "leave-decision-actions";
    [["approved", "Approve permanent deletion"], ["rejected", "Reject request"]].forEach(([decision, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = decision === "approved" ? "button button-primary" : "button button-outline";
      button.textContent = label;
      button.addEventListener("click", async () => {
        if (decision === "approved" && !window.confirm(
          `Permanently delete ${request.studentName} (${request.studentRollNumber}) and all linked academic records? This cannot be undone.`
        )) return;
        button.disabled = true;
        try {
          await Campusly.api("review-student-deletion", { requestId: request.id, decision });
          await refreshData();
          renderAllData();
          showToast(decision === "approved"
            ? "Student and linked database records permanently deleted."
            : "Student deletion request rejected; the account remains active.");
        } catch (error) {
          button.disabled = false;
          showToast(error.message || "The student deletion request could not be processed.");
        }
      });
      actions.append(button);
    });
    card.append(actions);
    approvalList.append(card);
  });
}

function appendAccountActions(row, account) {
  const cell = document.createElement("td");
  const actions = document.createElement("div");
  actions.className = "account-actions";
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "button button-outline";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => openAccountEditor(account));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "button button-outline";
  const pendingRequest = account.role === "student"
    && currentRole === "faculty"
    && (appData.studentDeletionRequests || []).some(
      (request) => request.studentId === account.id && request.status === "pending",
    );
  remove.textContent = pendingRequest ? "Pending HoD" : "Delete";
  remove.disabled = pendingRequest;
  if (!pendingRequest) remove.addEventListener("click", () => deactivateAccount(account));
  actions.append(edit, remove);
  cell.append(actions);
  row.append(cell);
}

function openAccountEditor(account) {
  const dialog = document.querySelector("#accountEditDialog");
  const form = document.querySelector("#accountEditForm");
  const isStudent = account.role === "student";
  form.elements.accountId.value = String(account.id);
  form.elements.name.value = account.name;
  form.elements.email.value = account.email;
  form.elements.rollNumber.value = account.rollNumber || "";
  form.elements.dateOfBirth.value = account.dateOfBirth || "";
  form.elements.fatherName.value = account.fatherName || "";
  document.querySelector("#accountEditDescription").textContent =
    `Editing ${account.role === "hod" ? "HoD" : account.role} account.`;
  document.querySelectorAll(".account-edit-staff").forEach((field) => {
    field.hidden = isStudent;
    field.querySelector("input").required = !isStudent;
  });
  document.querySelectorAll(".account-edit-student").forEach((field) => {
    field.hidden = !isStudent;
    field.querySelector("input").required = isStudent;
  });
  const sectionField = document.querySelector(".account-edit-section");
  sectionField.hidden = !isStudent || currentRole === "faculty";
  sectionField.querySelector("select").required = !sectionField.hidden;
  if (!sectionField.hidden) {
    const select = form.elements.section;
    const sections = currentRole === "director"
      ? appData.sections
      : appData.sections.filter((section) => section.hodEmail === currentUser.email);
    select.replaceChildren(new Option("Select a section", ""));
    sections.forEach((section) => select.add(new Option(`${section.name} · ${section.department}`, section.id)));
    select.value = account.sectionId || "";
  }
  document.querySelector("#accountEditMessage").hidden = true;
  dialog.showModal();
}

async function deactivateAccount(account) {
  const displayName = account.role === "student" ? `${account.name} (${account.rollNumber})` : account.name;
  const isStudent = account.role === "student";
  const isMentor = currentRole === "faculty";
  if (isMentor) {
    if (!window.confirm(`Send a permanent deletion request for ${displayName} to your HoD? The student will remain active unless the HoD approves.`)) return;
  } else {
    const confirmation = `Permanently delete ${displayName} and all directly related records from the database? This cannot be undone.`;
    if (!window.confirm(confirmation)) return;
  }
  try {
    if (isMentor) {
      await Campusly.api("request-student-deletion", { studentId: account.id });
    } else {
      await Campusly.api("delete-account", { accountId: account.id });
    }
    await refreshData();
    renderAllData();
    showToast(isMentor
      ? "Deletion request sent to the HoD. The student remains active until approval."
      : isStudent
        ? "Student and all linked records permanently deleted from the database."
        : "Account and directly related records permanently deleted from the database.");
  } catch (error) {
    showToast(error.message || "Account could not be deleted.");
  }
}

function showAccountMessage(form, message, success = false) {
  const output = form.querySelector(".account-message");
  output.textContent = message;
  output.classList.toggle("success", success);
  output.hidden = false;
}

async function createStaffAccount(form, role) {
  const output = form.querySelector(".account-message");
  output.hidden = true;
  try {
    const payload = {
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim().toLowerCase(),
      password: form.elements.password.value,
      role,
    };
    if (role === "hod" || currentRole === "director") payload.department = form.elements.department.value.trim();
    const result = await Campusly.api("create-account", payload);
    await refreshData();
    form.reset();
    populateAccountList();
    renderSections();
    showAccountMessage(
      form,
      result.sharedLogin
        ? `${role === "hod" ? "HoD" : "Faculty"} role added. Sign in to the correct portal with the existing email and password.`
        : `${role === "hod" ? "HoD" : "Faculty"} account created successfully. Share the login email and password securely.`,
      true,
    );
  } catch (error) {
    showAccountMessage(form, error.message || "Account creation failed. Please try again.");
  }
}

async function createStudentAccount(form) {
  try {
    const result = await Campusly.api("create-student", {
      sectionId: form.elements.section.value,
      name: form.elements.name.value.trim(),
      rollNumber: form.elements.rollNumber.value.trim(),
      dateOfBirth: form.elements.dateOfBirth.value,
      fatherName: form.elements.fatherName.value.trim(),
    });
    await refreshData();
    form.reset();
    renderAllData();
    const credentials = result.credentials;
    showAccountMessage(
      form,
      `Student created. Share these login details securely: Roll number: ${credentials.rollNumber} · DOB: ${credentials.dateOfBirth} · Password (case-sensitive): ${credentials.temporaryPassword}.`,
      true,
    );
  } catch (error) {
    showAccountMessage(form, error.message || "Student account creation failed. Please try again.");
  }
}

function updateRole() {
  const role = roleDetails[currentRole];
  if (!role) {
    window.location.replace("login.html");
    return;
  }
  role.name = currentUser.name;
  document.querySelector("#welcomeName").textContent = role.name;
  document.querySelector("#welcomeSubtitle").textContent = role.subtitle;
  document.querySelector("#roleBannerTitle").textContent = role.title;
  document.querySelector("#roleBannerText").textContent = role.text;
  document.querySelector("#studentStats").hidden = role.staff;
  document.querySelector("#staffStats").hidden = !role.staff;
  document.querySelector("#staffStatOne").textContent =
    currentRole === "director" ? "College attendance" : "Department attendance";
  document.querySelector("#currentRole").textContent = {
    student: "Student Portal",
    faculty: "Faculty Portal",
    hod: "Head of Department",
    director: "Director / Admin",
  }[currentRole];
  const isFacultyMentor = currentRole === "faculty" && getPublishableSections().length > 0;
  document.querySelector("#managementNav").hidden = !["director", "hod"].includes(currentRole) && !isFacultyMentor;
  document.querySelector("#managementNavLabel").textContent = isFacultyMentor ? "My students" : "People & access";
  document.querySelector("#managementEyebrow").textContent = isFacultyMentor ? "MENTOR WORKSPACE" : "PORTAL ADMINISTRATION";
  document.querySelector("#managementTitle").textContent = isFacultyMentor ? "My students" : "People & access";
  document.querySelector("#managementDescription").textContent = isFacultyMentor
    ? "Create student logins for your mentored sections and review your student roster."
    : "Create role accounts and manage who can sign in to this college portal.";
  document.querySelector("#collegeIdentityPanel").hidden = currentRole !== "director";
  document.querySelector("#createHodPanel").hidden = currentRole !== "director";
  document.querySelector("#directorStudentPanel").hidden = currentRole !== "director";
  document.querySelector("#createFacultyPanel").hidden = !["director", "hod"].includes(currentRole);
  document.querySelector("#createStudentPanel").hidden = currentRole !== "hod";
  document.querySelector("#createSectionPanel").hidden = currentRole !== "hod";
  document.querySelector("#subjectOfferingPanel").hidden = currentRole !== "hod";
  document.querySelector("#assignStudentPanel").hidden = currentRole !== "hod";
  document.querySelector("#mentorStudentPanel").hidden = !isFacultyMentor;
  document.querySelector("#sectionManagementPanel").hidden = currentRole === "faculty";
  document.querySelector("#accountDirectoryPanel").hidden = currentRole === "faculty";
  document.querySelector("#accountSecurityNote").hidden = currentRole === "faculty";
  document.querySelector("#hodDepartmentLabel").textContent = currentUser.department || "your department";
  document.querySelector("#lectureAttendancePanel").hidden = currentRole !== "faculty";
  document.querySelector("#openCorrection").hidden = currentRole !== "student";
  document.querySelector("#openLeaveRequest").hidden = currentRole !== "student";
  document.querySelector("#studentLeaveFormPanel").hidden = currentRole !== "student";
  document.querySelector("#leaveListHeading").textContent = currentRole === "student"
    ? "My leave requests"
    : currentRole === "faculty"
      ? "Leave requests for my mentees"
      : currentRole === "hod"
        ? "Leave requests awaiting HoD decision"
        : "College leave requests";
  document.querySelectorAll("[data-role-allow]").forEach((button) => {
    const roles = button.dataset.roleAllow.split(",");
    button.hidden = !roles.includes(currentRole);
  });
  document.querySelectorAll(".student-only").forEach((element) => { element.hidden = currentRole !== "student"; });
  document.querySelectorAll(".faculty-only").forEach((element) => { element.hidden = currentRole !== "faculty"; });
  document.querySelectorAll(".staff-only").forEach((item) => {
    item.hidden = item.id === "postNotice"
      ? !["director", "hod"].includes(currentRole)
      : item.id === "addMarks"
        ? currentRole !== "faculty"
        : !role.staff;
  });
  document.querySelectorAll(".approval-actions").forEach((actions) => {
    actions.hidden = currentRole !== "hod";
  });
  const initials = currentUser.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  document.querySelectorAll(".profile-copy strong").forEach((element) => { element.textContent = currentUser.name; });
  document.querySelectorAll(".profile-copy small").forEach((element) => {
    element.textContent = currentUser.department || appData.college.name;
  });
  document.querySelectorAll(".profile-mini .avatar, .top-avatar").forEach((element) => { element.textContent = initials; });
  Campusly.applyBranding(appData.college);
  const identityForm = document.querySelector("#collegeIdentityForm");
  identityForm.elements.collegeName.value = appData.college.name;
  identityForm.elements.collegeCode.value = appData.college.code;
  document.querySelector("#accountListTitle").textContent = currentRole === "director" ? "College accounts" : "Department accounts";
  const facultyDepartment = document.querySelector("#facultyDepartmentField");
  facultyDepartment.hidden = currentRole !== "director";
  facultyDepartment.querySelector("input").required = currentRole === "director";
  renderAllData();
}

navLinks.forEach((link) => link.addEventListener("click", () => changeView(link.dataset.view)));
document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => changeView(button.dataset.go));
});
document.querySelector("#menuToggle").addEventListener("click", () => sidebar.classList.toggle("open"));

document.querySelectorAll("#openCorrection, #openCorrection2").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("#deadlineError").hidden = true;
    correctionDialog.showModal();
  });
});
document.querySelector("#cancelCorrection").addEventListener("click", () => correctionDialog.close());
document.querySelector("#correctionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const now = new Date();
  const deadline = new Date(now);
  deadline.setHours(16, 50, 0, 0);
  if (now > deadline) {
    document.querySelector("#deadlineError").hidden = false;
    return;
  }
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  document.querySelector("#deadlineError").hidden = true;
  try {
    await Campusly.api("request-correction", {
      subject: form.querySelector("select").value,
      date: form.querySelector('[type="date"]').value,
      lectureTime: form.querySelector('[type="time"]').value,
      reason: form.querySelector("textarea").value.trim(),
    });
    await refreshData();
    renderAllData();
    form.reset();
    correctionDialog.close();
    showToast("Correction request sent to your HoD for approval.");
  } catch (error) {
    showToast(error.message || "Correction request could not be sent.");
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#postNotice").addEventListener("click", () => {
  document.querySelector("#noticePublishPanel").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#addMarks").addEventListener("click", () => {
  document.querySelector("#markPublishPanel").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector(".help-link").addEventListener("click", () => showToast("Please contact your college office for support."));

document.querySelector("#noticeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await Campusly.api("create-notice", {
      title: form.elements.title.value.trim(),
      category: form.elements.category.value,
      department: form.elements.department.value,
      body: form.elements.body.value.trim(),
    });
    await refreshData();
    form.reset();
    renderAllData();
    showAccountMessage(form, "Notice published for the selected audience.", true);
  } catch (error) {
    showAccountMessage(form, error.message || "Notice could not be published.");
  }
});

const timetableForm = document.querySelector("#timetableForm");
timetableForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await Campusly.api("create-timetable-entry", {
      sectionId: form.elements.section.value,
      weekday: Number(form.elements.weekday.value),
      subject: form.elements.subject.value.trim(),
      facultyName: form.elements.facultyName.value.trim(),
      startTime: form.elements.startTime.value,
      endTime: form.elements.endTime.value,
      room: form.elements.room.value.trim(),
    });
    await refreshData();
    form.reset();
    renderAllData();
    showAccountMessage(form, "Timetable class published.", true);
  } catch (error) {
    showAccountMessage(form, error.message || "Timetable class could not be published.");
  }
});

document.querySelector("#assignmentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await Campusly.api("create-assignment", {
      sectionId: form.elements.section.value,
      subject: form.elements.subject.value.trim(),
      title: form.elements.title.value.trim(),
      dueDate: form.elements.dueDate.value,
      description: form.elements.description.value.trim(),
    });
    await refreshData();
    form.reset();
    renderAllData();
    showAccountMessage(form, "Assignment published for the selected section.", true);
  } catch (error) {
    showAccountMessage(form, error.message || "Assignment could not be published.");
  }
});

document.querySelector("#markForm").elements.section.addEventListener("change", () => {
  renderMarkStudentOptions();
  renderMarkSubjectOptions();
});
document.querySelector("#markForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await Campusly.api("create-class-test-mark", {
      sectionId: form.elements.section.value,
      studentId: Number(form.elements.student.value),
      assessmentType: form.elements.assessmentType.value,
      subject: form.elements.subject.value.trim(),
      assessment: form.elements.assessment.value.trim(),
      testDate: form.elements.testDate.value,
      score: Number(form.elements.score.value),
      maxScore: Number(form.elements.maxScore.value),
    });
    await refreshData();
    form.reset();
    renderAllData();
    showAccountMessage(form, "Assessment marks uploaded for the selected student.", true);
  } catch (error) {
    showAccountMessage(form, error.message || "Marks could not be saved.");
  }
});

document.querySelector("#createHodForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (currentRole === "director") createStaffAccount(event.currentTarget, "hod");
});
document.querySelector("#createFacultyForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (["director", "hod"].includes(currentRole)) createStaffAccount(event.currentTarget, "faculty");
});
document.querySelector("#createStudentForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (currentRole === "hod") createStudentAccount(event.currentTarget);
});
document.querySelector("#directorStudentForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (currentRole === "director") createStudentAccount(event.currentTarget);
});

document.querySelector("#mentorStudentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (currentRole !== "faculty") return;
  const section = sectionById(form.elements.section.value);
  if (!section || section.mentorEmail !== currentUser.email) {
    showAccountMessage(form, "Select a section assigned to you as its mentor.");
    return;
  }
  createStudentAccount(form);
});

document.querySelector("#closeAccountEdit").addEventListener("click", () => {
  document.querySelector("#accountEditDialog").close();
});
document.querySelector("#cancelAccountEdit").addEventListener("click", () => {
  document.querySelector("#accountEditDialog").close();
});
document.querySelector("#accountEditForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const isStudent = !document.querySelector(".account-edit-student").hidden;
  const payload = {
    accountId: Number(form.elements.accountId.value),
    name: form.elements.name.value.trim(),
  };
  if (isStudent) {
    Object.assign(payload, {
      rollNumber: form.elements.rollNumber.value.trim(),
      dateOfBirth: form.elements.dateOfBirth.value,
      fatherName: form.elements.fatherName.value.trim(),
    });
    if (currentRole !== "faculty") payload.sectionId = form.elements.section.value;
  } else {
    payload.email = form.elements.email.value.trim().toLowerCase();
  }
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const result = await Campusly.api("update-account", payload);
    await refreshData();
    renderAllData();
    document.querySelector("#accountEditDialog").close();
    showToast(result.credentials
      ? `Student details updated. New password (case-sensitive): ${result.credentials.temporaryPassword}.`
      : "Account details updated.");
  } catch (error) {
    const message = document.querySelector("#accountEditMessage");
    message.textContent = error.message || "Account could not be updated.";
    message.hidden = false;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#createSectionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  if (currentRole !== "hod") return;
  if (!form.elements.mentor.value) {
    showAccountMessage(form, "Assign a faculty mentor before creating the section.");
    return;
  }
  try {
    await Campusly.api("create-section", {
      name,
      course: form.elements.course.value.trim(),
      mentorEmail: form.elements.mentor.value,
    });
    await refreshData();
    form.reset();
    renderAllData();
    showAccountMessage(form, "Section created and mentor assigned.", true);
  } catch (error) {
    showAccountMessage(form, error.message || "Section could not be created.");
  }
});

document.querySelector("#subjectOfferingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (currentRole !== "hod") return;
  const selected = [...form.querySelectorAll("input:checked")];
  const offerings = SUBJECT_OPTIONS.map((subject) => ({
    subject,
    sectionIds: selected.filter((input) => input.dataset.subject === subject).map((input) => input.value),
  })).filter((offering) => offering.sectionIds.length > 0);
  if (!offerings.length) {
    showAccountMessage(form, "Select at least one subject and section.");
    return;
  }
  try {
    await Campusly.api("save-subject-offerings", { offerings });
    await refreshData();
    renderAllData();
    showAccountMessage(form, "Subject-section choices saved. Assign a faculty member to each section below.", true);
  } catch (error) {
    showAccountMessage(form, error.message || "Subject-section choices could not be saved.");
  }
});

document.querySelector("#subjectFacultyAssignmentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (currentRole !== "hod") return;
  const rows = [...document.querySelectorAll("#subjectFacultyAssignments tr")];
  const assignments = rows.map((row) => ({
    sectionId: row.dataset.sectionId,
    subject: row.dataset.subject,
    facultyId: row.querySelector(".subject-faculty-select").value,
  }));
  if (!assignments.length) {
    showAccountMessage(form, "Add subjects to sections before assigning faculty.");
    return;
  }
  if (assignments.some((assignment) => !assignment.facultyId)) {
    showAccountMessage(form, "Select a faculty member for every section subject before saving.");
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await Campusly.api("assign-subject-faculty", { assignments });
    await refreshData();
    renderAllData();
    showAccountMessage(form, "All faculty assignments saved successfully.", true);
  } catch (error) {
    showAccountMessage(form, error.message || "Faculty assignments could not be saved.");
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#assignStudentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (currentRole !== "hod") return;
  const student = userByEmail(form.elements.student.value, "student");
  const section = sectionById(form.elements.section.value);
  if (!student || !section || section.hodEmail !== currentUser.email) {
    showAccountMessage(form, "Select a student and a section from your department.");
    return;
  }
  try {
    await Campusly.api("assign-student", { studentEmail: student.email, sectionId: section.id });
    await refreshData();
    renderAllData();
    renderLectureRoster();
    showAccountMessage(form, `${student.name} assigned to ${section.name}.`, true);
  } catch (error) {
    showAccountMessage(form, error.message || "Student could not be assigned.");
  }
});

document.querySelector("#lectureAttendanceForm").elements.section.addEventListener("change", () => {
  renderLectureRoster();
});
document.querySelector("#lectureAttendanceForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (currentRole !== "faculty") return;
  const section = sectionById(form.elements.section.value);
  const students = appData.users.filter((user) => user.role === "student" && user.sectionId === section?.id);
  const output = form.querySelector(".account-message");
  output.hidden = true;
  if (!section || !students.length) {
    showAccountMessage(form, "Select a section with students assigned before taking attendance.");
    return;
  }
  const date = localDateString();
  const lectureNumber = Number(form.elements.lectureNumber.value);
  const isFirstLecture = form.elements.firstLecture.checked;
  if (isFirstLecture && lectureNumber !== 1) {
    showAccountMessage(form, "The first lecture of the day must be recorded as Lecture 1, regardless of subject.");
    return;
  }
  if (appData.attendance.some((record) =>
    record.sectionId === section.id &&
    record.date === date &&
    record.lectureNumber === lectureNumber,
  )) {
    showAccountMessage(form, `Lecture ${lectureNumber} is already recorded for this section today.`);
    return;
  }
  if (isFirstLecture && appData.attendance.some((record) => record.sectionId === section.id && record.date === date && record.isFirstLecture)) {
    showAccountMessage(form, "This section already has a first lecture recorded today. The first lecture is counted only once per day, regardless of subject.");
    return;
  }
  const attendees = students.map((student) => ({
    email: student.email,
    status: form.elements[`attendance-${student.email}`]?.value || "absent",
  }));
  try {
    await Campusly.api("record-attendance", {
      sectionId: section.id,
      subject: form.elements.subject.value.trim(),
      lectureNumber,
      lectureTime: form.elements.lectureTime.value,
      date,
      isFirstLecture,
      attendees,
    });
    await refreshData();
    renderAllData();
    form.elements.subject.value = "";
    form.elements.firstLecture.checked = false;
    showAccountMessage(form, "Attendance saved for this lecture.", true);
  } catch (error) {
    showAccountMessage(form, error.message || "Attendance could not be saved.");
  }
});

document.querySelector("#openLeaveRequest").addEventListener("click", () => {
  changeView("leaves");
  document.querySelector("#studentLeaveFormPanel").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#leaveRequestForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const output = form.querySelector(".account-message");
  output.hidden = true;
  if (currentRole !== "student") {
    return;
  }
  if (form.elements.toDate.value < form.elements.fromDate.value) {
    setLeaveMessage(form, "The leave end date must be on or after the start date.");
    return;
  }
  try {
    await Campusly.api("request-leave", {
      fromDate: form.elements.fromDate.value,
      toDate: form.elements.toDate.value,
      reason: form.elements.reason.value.trim(),
      guardianName: form.elements.guardianName.value.trim(),
      guardianRelation: form.elements.guardianRelation.value.trim(),
      guardianPhone: form.elements.guardianPhone.value.trim(),
    });
    await refreshData();
    form.reset();
    renderAllData();
    setLeaveMessage(form, "Leave request sent to your assigned mentor for family contact and review.", true);
  } catch (error) {
    setLeaveMessage(form, error.message || "Leave request could not be sent.");
  }
});

function readLogoFile(file) {
  if (!file) return Promise.resolve("");
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1024 * 1024) {
    return Promise.reject(new Error("Choose a PNG, JPEG or WebP logo smaller than 1 MB."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("The selected logo could not be read.")));
    reader.readAsDataURL(file);
  });
}

const collegeLogoInput = document.querySelector("#collegeIdentityForm").elements.collegeLogo;
collegeLogoInput.addEventListener("change", async () => {
  const file = collegeLogoInput.files[0];
  if (!file) return;
  try {
    const preview = document.querySelector("#dashboardLogoPreview");
    preview.querySelector("img").src = await readLogoFile(file);
    preview.querySelector("span").textContent = file.name;
    preview.hidden = false;
  } catch (error) {
    collegeLogoInput.value = "";
    showAccountMessage(document.querySelector("#collegeIdentityForm"), error.message);
  }
});

document.querySelector("#collegeIdentityForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (currentRole !== "director") return;
  const form = event.currentTarget;
  try {
    const uploadedLogo = await readLogoFile(form.elements.collegeLogo.files[0]);
    const updatedCollege = {
      name: form.elements.collegeName.value.trim(),
      code: form.elements.collegeCode.value.trim().toUpperCase(),
      logo: uploadedLogo || null,
    };
    await Campusly.api("update-college", {
      collegeName: updatedCollege.name,
      collegeCode: updatedCollege.code,
      logo: updatedCollege.logo,
    });
    await refreshData();
    Campusly.applyBranding(appData.college);
    showAccountMessage(form, "College name, code and logo have been updated across the portals.", true);
  } catch (error) {
    showAccountMessage(form, error.message || "Could not update college identity.");
  }
});

const date = new Date();
document.querySelector("#todayLabel").textContent = date
  .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  .toUpperCase();

document.querySelector("#logoutButton").addEventListener("click", async () => {
  try {
    await Campusly.api("logout", {});
  } finally {
    window.location.href = "login.html";
  }
});

let stateSyncInProgress = false;
async function syncPortalState() {
  if (stateSyncInProgress || document.visibilityState === "hidden") return;
  stateSyncInProgress = true;
  try {
    await refreshData();
    updateRole();
  } catch (error) {
    if (/sign in again|account is no longer available/i.test(error.message)) {
      window.location.replace("login.html");
    } else {
      console.error("Could not sync the latest portal data.", error);
    }
  } finally {
    stateSyncInProgress = false;
  }
}

window.setInterval(syncPortalState, 30000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") syncPortalState();
});

updateRole();
})();
