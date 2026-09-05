(() => {
  "use strict";

  const exact = {
    "CHOOSE YOUR ROLE": "আপনার ভূমিকা নির্বাচন করুন",
    "How will you use GitStack?": "আপনি কীভাবে GitStack ব্যবহার করবেন?",
    "Select your account type before continuing.": "চালিয়ে যাওয়ার আগে আপনার অ্যাকাউন্টের ধরন নির্বাচন করুন।",
    "Student": "শিক্ষার্থী",
    "Instructor": "শিক্ষক",
    "Create your account": "আপনার অ্যাকাউন্ট তৈরি করুন",
    "Login to GitStack": "GitStack-এ লগইন করুন",
    "Full name": "পূর্ণ নাম",
    "University ID": "বিশ্ববিদ্যালয় আইডি",
    "University email": "বিশ্ববিদ্যালয়ের ইমেইল",
    "Department": "বিভাগ",
    "Semester / designation": "সেমিস্টার / পদবি",
    "Create password": "পাসওয়ার্ড তৈরি করুন",
    "Confirm password": "পাসওয়ার্ড নিশ্চিত করুন",
    "Create GitStack account": "GitStack অ্যাকাউন্ট তৈরি করুন",
    "Login securely": "নিরাপদে লগইন করুন",
    "Already registered?": "আগেই নিবন্ধিত?",
    "Need an account?": "অ্যাকাউন্ট প্রয়োজন?",
    "Student account": "শিক্ষার্থী অ্যাকাউন্ট",
    "Instructor account": "শিক্ষক অ্যাকাউন্ট",
    "WELCOME BACK": "আবার স্বাগতম",
    "JOIN GITSTACK": "GitStack-এ যোগ দিন",
    "Continue your GitStack workflow.": "আপনার GitStack ওয়ার্কফ্লো চালিয়ে যান।",
    "Create your learning workspace.": "আপনার শেখার ওয়ার্কস্পেস তৈরি করুন।",
    "GitStack is a mission-based Git learning and collaboration platform where students first learn Git in a safe environment, then form teams, follow real-world software-development workflows, and have their work automatically evaluated by the system.": "GitStack একটি মিশনভিত্তিক গিট শেখা ও সহযোগিতা প্ল্যাটফর্ম, যেখানে শিক্ষার্থীরা প্রথমে নিরাপদ পরিবেশে গিট শেখে, পরে টিম গঠন করে বাস্তব সফটওয়্যার উন্নয়ন ওয়ার্কফ্লো অনুসরণ করে এবং সিস্টেম তাদের কাজ স্বয়ংক্রিয়ভাবে মূল্যায়ন করে।",
    "GitStack is a mission-based Git learning and collaboration laboratory where university students first practise safely, then work in controlled teams and receive automatic assessment of both their result and their development process.": "GitStack একটি মিশনভিত্তিক গিট শেখা ও সহযোগিতা ল্যাব, যেখানে বিশ্ববিদ্যালয়ের শিক্ষার্থীরা প্রথমে নিরাপদে অনুশীলন করে, পরে নিয়ন্ত্রিত টিমে কাজ করে এবং তাদের ফলাফল ও উন্নয়ন প্রক্রিয়া—দুটোরই স্বয়ংক্রিয় মূল্যায়ন পায়।",
    "Yes. Team Collaboration Mode assigns roles, creates shared practice repositories and generates individual and team reports.": "হ্যাঁ। Team Collaboration Mode ভূমিকা নির্ধারণ করে, শেয়ার করা অনুশীলন রিপোজিটরি তৈরি করে এবং ব্যক্তিগত ও টিম রিপোর্ট দেয়।",
    "The system checks repository state, commands, branches, commits, pull requests, reviews, conflicts and test results.": "সিস্টেম রিপোজিটরির অবস্থা, কমান্ড, ব্রাঞ্চ, কমিট, পুল রিকোয়েস্ট, রিভিউ, কনফ্লিক্ট ও টেস্টের ফলাফল পরীক্ষা করে।",
    "No. GitStack begins with Git fundamentals and can use a short initial assessment to recommend your starting level.": "না। GitStack গিটের মৌলিক বিষয় থেকে শুরু করে এবং একটি সংক্ষিপ্ত প্রাথমিক মূল্যায়নের মাধ্যমে উপযুক্ত শুরুর ধাপ নির্ধারণ করে।",
    "No. It is an instructor-controlled learning laboratory for practicing and evaluating professional Git workflows.": "না। এটি শিক্ষকের নিয়ন্ত্রিত একটি শেখার ল্যাব, যেখানে পেশাদার গিট ওয়ার্কফ্লো অনুশীলন ও মূল্যায়ন করা হয়।",
    "Learn Git → Practise safely → Work in teams → Follow real workflow → Get automatically assessed": "গিট শিখুন → নিরাপদে অনুশীলন করুন → টিমে কাজ করুন → বাস্তব ওয়ার্কফ্লো অনুসরণ করুন → স্বয়ংক্রিয় মূল্যায়ন পান",
    "Mission-based Git learning and collaboration laboratory for university students.": "বিশ্ববিদ্যালয়ের শিক্ষার্থীদের জন্য মিশনভিত্তিক গিট শেখা ও সহযোগিতা ল্যাব।",
    "Every level ends with practical missions that are evaluated automatically.": "প্রতিটি ধাপ বাস্তব অনুশীলনভিত্তিক মিশনের মাধ্যমে শেষ হয় এবং স্বয়ংক্রিয়ভাবে মূল্যায়িত হয়।",
    "Work with issues, branches, commits, Pull Requests, reviews and conflicts": "ইস্যু, ব্রাঞ্চ, কমিট, পুল রিকোয়েস্ট, রিভিউ ও কনফ্লিক্ট নিয়ে কাজ করুন",
    "Receive Bangla feedback, XP, progress and assessment reports": "বাংলা ফিডব্যাক, XP, অগ্রগতি ও মূল্যায়ন রিপোর্ট পান",
    "Learn Git → Practise Safely → Work in Teams → Get Assessed": "গিট শিখুন → নিরাপদে অনুশীলন করুন → টিমে কাজ করুন → মূল্যায়ন পান",
    "Git learning that evaluates the complete workflow.": "সম্পূর্ণ ওয়ার্কফ্লো মূল্যায়ন করে এমন গিট শিক্ষা।",
    "Connect local Git work to a shared repository": "লোকাল গিট কাজকে শেয়ার করা রিপোজিটরির সাথে যুক্ত করুন",
    "Frontend built with HTML, CSS and JavaScript.": "ফ্রন্টএন্ড HTML, CSS ও JavaScript দিয়ে তৈরি।",
    "Practice Git safely in isolated repositories": "আলাদা ও নিরাপদ রিপোজিটরিতে গিট অনুশীলন করুন",
    "Learn. Practice. Collaborate. Get assessed.": "শিখুন। অনুশীলন করুন। সহযোগিতা করুন। মূল্যায়ন পান।",
    "Learn Git through the way real teams work.": "বাস্তব টিম যেভাবে কাজ করে, সেভাবে গিট শিখুন।",
    "The complete GitStack learning environment": "সম্পূর্ণ GitStack শেখার পরিবেশ",
    "Built using the workflow GitStack teaches": "GitStack যে ওয়ার্কফ্লো শেখায়, সেই ওয়ার্কফ্লো ব্যবহার করে তৈরি",
    "Create, switch, merge and manage branches": "ব্রাঞ্চ তৈরি, পরিবর্তন, মার্জ ও পরিচালনা",
    "Follow a real team collaboration workflow": "বাস্তব টিম সহযোগিতা ওয়ার্কফ্লো অনুসরণ করুন",
    "Automatic individual and team assessment": "স্বয়ংক্রিয় ব্যক্তিগত ও টিম মূল্যায়ন",
    "Initialize, track, stage, commit, status": "রিপোজিটরি তৈরি, ট্র্যাক, স্টেজ, কমিট ও স্ট্যাটাস",
    "Issues, PRs, reviews and merge conflicts": "ইস্যু, পুল রিকোয়েস্ট, রিভিউ ও মার্জ কনফ্লিক্ট",
    "Clone, push, pull and work with remotes": "ক্লোন, পুশ, পুল ও রিমোট রিপোজিটরি ব্যবহার",
    "Was the professional workflow followed?": "পেশাদার ওয়ার্কফ্লো অনুসরণ করা হয়েছে কি?",
    "Create the required branch and commits": "প্রয়োজনীয় ব্রাঞ্চ ও কমিট তৈরি করুন",
    "Do I need to know Git before starting?": "শুরু করার আগে কি গিট জানা প্রয়োজন?",
    "A focused and realistic first version": "কেন্দ্রিত ও বাস্তবসম্মত প্রথম সংস্করণ",
    "Designed for students and instructors": "শিক্ষার্থী ও শিক্ষকদের জন্য তৈরি",
    "From assigned issue to assessed merge": "অর্পিত ইস্যু থেকে মূল্যায়িত মার্জ পর্যন্ত",
    "Built with HTML, CSS and JavaScript.": "HTML, CSS ও JavaScript দিয়ে তৈরি।",
    "Does GitStack support team projects?": "GitStack কি টিম প্রজেক্ট সমর্থন করে?",
    "Learn Git through practical missions": "ব্যবহারিক মিশনের মাধ্যমে গিট শিখুন",
    "Recommended GitStack technology flow": "প্রস্তাবিত GitStack প্রযুক্তি প্রবাহ",
    "Resolve the controlled team conflict": "নিয়ন্ত্রিত টিম কনফ্লিক্ট সমাধান করুন",
    "Synchronize with the team repository": "টিম রিপোজিটরির সাথে সমন্বয় করুন",
    "Resolve a controlled merge conflict": "নিয়ন্ত্রিত মার্জ কনফ্লিক্ট সমাধান করুন",
    "Use automated tests before approval": "অনুমোদনের আগে স্বয়ংক্রিয় টেস্ট চালান",
    "Start your first GitStack mission.": "আপনার প্রথম GitStack মিশন শুরু করুন।",
    "More than memorizing Git commands": "শুধু গিট কমান্ড মুখস্থ করার চেয়েও বেশি",
    "Essential commands in this level": "এই ধাপের প্রয়োজনীয় কমান্ড",
    "How GitStack assesses this level": "GitStack যেভাবে এই ধাপ মূল্যায়ন করে",
    "Questions about remote workflows": "রিমোট ওয়ার্কফ্লো নিয়ে প্রশ্ন",
    "Complete collaboration workflow": "সম্পূর্ণ সহযোগিতা ওয়ার্কফ্লো",
    "How GitStack team missions work": "GitStack টিম মিশন যেভাবে কাজ করে",
    "READY TO BUILD REAL GIT SKILLS?": "বাস্তব গিট দক্ষতা গড়তে প্রস্তুত?",
    "Remote feature-branch workflow": "রিমোট ফিচার-ব্রাঞ্চ ওয়ার্কফ্লো",
    "Clone the prepared repository": "প্রস্তুত রিপোজিটরি ক্লোন করুন",
    "How did the team collaborate?": "টিম কীভাবে সহযোগিতা করেছে?",
    "Questions about collaboration": "সহযোগিতা নিয়ে প্রশ্ন",
    "University project prototype.": "বিশ্ববিদ্যালয় প্রকল্পের প্রোটোটাইপ।",
    "Use professional branch names": "পেশাদার ব্রাঞ্চ নাম ব্যবহার করুন",
    "Work safely with Git branches": "গিট ব্রাঞ্চ ব্যবহার করে নিরাপদে কাজ করুন",
    "Create your first repository": "আপনার প্রথম রিপোজিটরি তৈরি করুন",
    "GitStack asks four questions": "GitStack চারটি প্রশ্ন করে",
    "How remote repositories work": "রিমোট রিপোজিটরি যেভাবে কাজ করে",
    "Open a complete Pull Request": "সম্পূর্ণ পুল রিকোয়েস্ট খুলুন",
    "Questions about Git branches": "গিট ব্রাঞ্চ নিয়ে প্রশ্ন",
    "Receive Automatic Assessment": "স্বয়ংক্রিয় মূল্যায়ন পান",
    "Start from an assigned issue": "অর্পিত ইস্যু থেকে শুরু করুন",
    "Continue to Remote Workflow": "রিমোট ওয়ার্কফ্লোতে যান",
    "How are missions evaluated?": "মিশন কীভাবে মূল্যায়িত হয়?",
    "Is GitStack another GitHub?": "GitStack কি আরেকটি GitHub?",
    "Start the Branching mission": "ব্রাঞ্চিং মিশন শুরু করুন",
    "Understand the Git workflow": "গিট ওয়ার্কফ্লো বুঝুন",
    "What did the student build?": "শিক্ষার্থী কী তৈরি করেছে?",
    "Create and switch branches": "ব্রাঞ্চ তৈরি ও পরিবর্তন করুন",
    "Frequently asked questions": "সাধারণ জিজ্ঞাসা",
    "Inspect and manage remotes": "রিমোট পরীক্ষা ও পরিচালনা করুন",
    "Questions about Git basics": "গিটের মৌলিক বিষয় নিয়ে প্রশ্ন",
    "Review and request changes": "রিভিউ করুন ও পরিবর্তন চাইুন",
    "Continue to Collaboration": "সহযোগিতা অংশে যান",
    "Start at the right level.": "সঠিক ধাপ থেকে শুরু করুন।",
    "Configure your identity": "আপনার পরিচয় কনফিগার করুন",
    "Read the project vision": "প্রকল্পের লক্ষ্য পড়ুন",
    "4 levels to master Git": "গিট আয়ত্ত করার ৪টি ধাপ",
    "COMPLETE TEAM WORKFLOW": "সম্পূর্ণ টিম ওয়ার্কফ্লো",
    "Explore the curriculum": "পাঠ্যক্রম দেখুন",
    "Follow real workflows.": "বাস্তব ওয়ার্কফ্লো অনুসরণ করুন।",
    "Improve with feedback.": "ফিডব্যাকের মাধ্যমে উন্নতি করুন।",
    "Requirements satisfied": "শর্ত পূরণ হয়েছে",
    "Validation in progress": "মূল্যায়ন চলছে",
    "Continue to Branching": "ব্রাঞ্চিংয়ে যান",
    "Learning and missions": "শেখা ও মিশন",
    "Structured curriculum": "পরিকল্পিত পাঠ্যক্রম",
    "What is a Git branch?": "গিট ব্রাঞ্চ কী?",
    "YOUR GITSTACK JOURNEY": "আপনার GITSTACK যাত্রা",
    "Collaboration Basics": "সহযোগিতার মৌলিক বিষয়",
    "Common remote errors": "সাধারণ রিমোট ত্রুটি",
    "Follow Real Workflow": "বাস্তব ওয়ার্কফ্লো অনুসরণ করুন",
    "Instructor dashboard": "শিক্ষক ড্যাশবোর্ড",
    "Merge completed work": "সম্পন্ন কাজ মার্জ করুন",
    "Practice Git safely.": "নিরাপদে গিট অনুশীলন করুন।",
    "Return to curriculum": "পাঠ্যক্রমে ফিরুন",
    "View for instructors": "শিক্ষকদের জন্য দেখুন",
    "CORE PRODUCT LAYERS": "মূল পণ্য স্তরসমূহ",
    "DEVELOPMENT PROCESS": "উন্নয়ন প্রক্রিয়া",
    "Gitea collaboration": "Gitea সহযোগিতা",
    "Safe Docker sandbox": "নিরাপদ Docker স্যান্ডবক্স",
    "SYSTEM ARCHITECTURE": "সিস্টেম আর্কিটেকচার",
    "The .gitignore file": ".gitignore ফাইল",
    "Workflow assessment": "ওয়ার্কফ্লো মূল্যায়ন",
    "ABOUT THE PROJECT": "প্রকল্প সম্পর্কে",
    "Branch discipline": "ব্রাঞ্চ শৃঙ্খলা",
    "Complete missions": "মিশন সম্পন্ন করুন",
    "Feature Developer": "ফিচার ডেভেলপার",
    "How was it built?": "কীভাবে তৈরি করেছে?",
    "Individual result": "ব্যক্তিগত ফলাফল",
    "Practical mission": "ব্যবহারিক মিশন",
    "Start the mission": "মিশন শুরু করুন",
    "Student dashboard": "শিক্ষার্থী ড্যাশবোর্ড",
    "Your first commit": "আপনার প্রথম কমিট",
    "Browser terminal": "ব্রাউজার টার্মিনাল",
    "Earn your report": "আপনার রিপোর্ট অর্জন করুন",
    "Get started free": "বিনামূল্যে শুরু করুন",
    "GitStack journey": "GitStack যাত্রা",
    "Role performance": "ভূমিকাভিত্তিক কার্যক্রম",
    "Bangla feedback": "বাংলা ফিডব্যাক",
    "Conflict result": "কনফ্লিক্ট সমাধানের ফলাফল",
    "For instructors": "শিক্ষকদের জন্য",
    "For Instructors": "শিক্ষকদের জন্য",
    "Mission waiting": "মিশন অপেক্ষমান",
    "Practise Safely": "নিরাপদে অনুশীলন করুন",
    "Remote Workflow": "রিমোট ওয়ার্কফ্লো",
    "Synchronization": "সমন্বয়",
    "Take assessment": "প্রাথমিক মূল্যায়ন দিন",
    "About GitStack": "GitStack সম্পর্কে",
    "Commit quality": "কমিটের মান",
    "Correct remote": "সঠিক রিমোট",
    "Fetch or pull?": "Fetch নাকি Pull?",
    "PROJECT VISION": "প্রকল্পের লক্ষ্য",
    "Read the guide": "গাইড পড়ুন",
    "Setting up Git": "গিট সেটআপ করুন",
    "Test Developer": "টেস্ট ডেভেলপার",
    "Code Reviewer": "কোড রিভিউয়ার",
    "Pull Requests": "পুল রিকোয়েস্ট",
    "Start mission": "মিশন শুরু করুন",
    "Team Missions": "টিম মিশন",
    "Work in Teams": "টিমে কাজ করুন",
    "Branch usage": "ব্রাঞ্চ ব্যবহার",
    "For Students": "শিক্ষার্থীদের জন্য",
    "Future scope": "ভবিষ্যৎ পরিধি",
    "Get Assessed": "মূল্যায়ন পান",
    "How it works": "কীভাবে কাজ করে",
    "Merge result": "মার্জের ফলাফল",
    "On this page": "এই পৃষ্ঠায়",
    "Pull Request": "পুল রিকোয়েস্ট",
    "TARGET USERS": "লক্ষ্য ব্যবহারকারী",
    "Team outcome": "টিমের ফলাফল",
    "Team Reports": "টিম রিপোর্ট",
    "What is Git?": "গিট কী?",
    "Code Review": "কোড রিভিউ",
    "Collaborate": "সহযোগিতা",
    "Install Git": "গিট ইনস্টল করুন",
    "Instructors": "শিক্ষক",
    "Join a team": "টিমে যোগ দিন",
    "Team result": "টিম ফলাফল",
    "Assessment": "মূল্যায়ন",
    "Curriculum": "পাঠ্যক্রম",
    "Git Basics": "গিটের মৌলিক বিষয়",
    "Branching": "ব্রাঞ্চিং",
    "Learn Git": "গিট শিখুন",
    "MVP SCOPE": "MVP পরিধি",
    "Commands": "কমান্ড",
    "complete": "সম্পন্ন",
    "Included": "অন্তর্ভুক্ত",
    "Missions": "মিশন",
    "Progress": "অগ্রগতি",
    "Students": "শিক্ষার্থী",
    "Sign Up": "সাইন আপ",
    "Branch": "ব্রাঞ্চ",
    "Commit": "কমিট",
    "Review": "রিভিউ",
    "Reward": "পুরস্কার",
    "Issue": "ইস্যু",
    "Learn": "শিখুন",
    "Level": "ধাপ",
    "Login": "লগইন",
    "Merge": "মার্জ",
    "Tests": "টেস্ট",
    "Home": "হোম",
    "Next": "পরবর্তী",
    "Push": "পুশ",
    "FAQ": "সাধারণ প্রশ্ন"
  };

  Object.assign(exact, {
    /* V15 student and instructor dashboards */
    "Dashboard": "ড্যাশবোর্ড",
    "Student Dashboard": "শিক্ষার্থী ড্যাশবোর্ড",
    "Instructor Dashboard": "শিক্ষক ড্যাশবোর্ড",
    "Mission Workspace": "মিশন ওয়ার্কস্পেস",
    "Progress & XP": "অগ্রগতি ও XP",
    "Assessment & Feedback": "মূল্যায়ন ও ফিডব্যাক",
    "Team Activity": "টিম কার্যক্রম",
    "Profile": "প্রোফাইল",
    "Logout": "লগআউট",
    "Assignments": "অ্যাসাইনমেন্ট",
    "Teams": "টিমসমূহ",
    "Assessments": "মূল্যায়নসমূহ",
    "Analytics": "অ্যানালিটিক্স",
    "Activity": "কার্যক্রম",
    "Student Detail": "শিক্ষার্থীর বিস্তারিত",
    "Profile & Security": "প্রোফাইল ও নিরাপত্তা",
    "Your Git learning, missions and progress in one place.": "আপনার গিট শেখা, মিশন ও অগ্রগতি এক জায়গায়।",
    "Choose an individual Git mission or review your team mission.": "একটি ব্যক্তিগত গিট মিশন বেছে নিন অথবা আপনার টিম মিশন দেখুন।",
    "Instructions, live Docker terminal, reset, submit and feedback.": "নির্দেশনা, লাইভ Docker টার্মিনাল, রিসেট, সাবমিট ও ফিডব্যাক।",
    "Review validator results and Bangla guidance from your missions.": "আপনার মিশনের ভ্যালিডেশন ফলাফল ও বাংলা নির্দেশনা দেখুন।",
    "Manage student details and account password.": "শিক্ষার্থীর তথ্য ও অ্যাকাউন্ট পাসওয়ার্ড পরিচালনা করুন।",
    "Monitor students, assignments, teams and workflow results.": "শিক্ষার্থী, অ্যাসাইনমেন্ট, টিম ও ওয়ার্কফ্লো ফলাফল পর্যবেক্ষণ করুন।",
    "Search students and inspect progress, XP, team and mission history.": "শিক্ষার্থী খুঁজুন এবং অগ্রগতি, XP, টিম ও মিশন ইতিহাস দেখুন।",
    "Manage the predefined GitStack mission catalogue and performance.": "নির্ধারিত GitStack মিশন তালিকা ও পারফরম্যান্স পরিচালনা করুন।",
    "Assign predefined individual or team missions and manage due dates.": "নির্ধারিত ব্যক্তিগত বা টিম মিশন অ্যাসাইন করুন এবং সময়সীমা পরিচালনা করুন।",
    "Create and manage instructor-assigned three-person teams and roles.": "শিক্ষক-নির্ধারিত তিন সদস্যের টিম ও ভূমিকা তৈরি এবং পরিচালনা করুন।",
    "Review the actual repository-state assessment results generated from student mission attempts.": "শিক্ষার্থীর মিশন প্রচেষ্টা থেকে তৈরি বাস্তব রিপোজিটরি-অবস্থা মূল্যায়নের ফলাফল দেখুন।",
    "MVP-level analytics for completion, XP, assessment performance and repeated workflow mistakes.": "সম্পন্নতা, XP, মূল্যায়ন পারফরম্যান্স ও পুনরাবৃত্ত ওয়ার্কফ্লো ভুলের MVP-স্তরের অ্যানালিটিক্স।",
    "Monitor recent student, assignment, mission and sandbox activity.": "সাম্প্রতিক শিক্ষার্থী, অ্যাসাইনমেন্ট, মিশন ও স্যান্ডবক্স কার্যক্রম পর্যবেক্ষণ করুন।",
    "Manage encrypted instructor profile information and account password.": "এনক্রিপ্ট করা শিক্ষক প্রোফাইল তথ্য ও অ্যাকাউন্ট পাসওয়ার্ড পরিচালনা করুন।",
    "STUDENT WORKSPACE": "শিক্ষার্থী ওয়ার্কস্পেস",
    "INSTRUCTOR WORKSPACE": "শিক্ষক ওয়ার্কস্পেস",
    "LEARN BY DOING": "কাজ করে শিখুন",
    "REAL GIT WORKSPACE": "বাস্তব গিট ওয়ার্কস্পেস",
    "AUTOMATIC ASSESSMENT": "স্বয়ংক্রিয় মূল্যায়ন",
    "ACCOUNT": "অ্যাকাউন্ট",
    "ACCOUNT SECURITY": "অ্যাকাউন্ট নিরাপত্তা",
    "STUDENT MONITORING": "শিক্ষার্থী পর্যবেক্ষণ",
    "STUDENT REPORT": "শিক্ষার্থী রিপোর্ট",
    "PREDEFINED CURRICULUM": "পূর্বনির্ধারিত পাঠ্যক্রম",
    "ASSIGNMENT MANAGEMENT": "অ্যাসাইনমেন্ট ব্যবস্থাপনা",
    "THREE-PERSON TEAMS": "তিন সদস্যের টিম",
    "CLASS INSIGHTS": "ক্লাস বিশ্লেষণ",
    "Welcome back,": "আবার স্বাগতম,",
    "Welcome,": "স্বাগতম,",
    "Continue a mission, practice safely in Docker, and track every completed Git workflow.": "একটি মিশন চালিয়ে যান, Docker-এ নিরাপদে অনুশীলন করুন এবং সম্পন্ন প্রতিটি গিট ওয়ার্কফ্লো ট্র্যাক করুন।",
    "Assign predefined Git missions, build three-person teams, monitor student progress and review assessment results from PostgreSQL.": "নির্ধারিত গিট মিশন অ্যাসাইন করুন, তিন সদস্যের টিম তৈরি করুন, শিক্ষার্থীর অগ্রগতি পর্যবেক্ষণ করুন এবং PostgreSQL থেকে মূল্যায়ন ফলাফল দেখুন।",
    "Start a mission": "মিশন শুরু করুন",
    "Current mission": "বর্তমান মিশন",
    "View all": "সব দেখুন",
    "Quick actions": "দ্রুত কাজ",
    "Browse missions": "মিশন দেখুন",
    "Sandbox playground": "স্যান্ডবক্স অনুশীলন",
    "Practice outside a mission": "মিশনের বাইরে অনুশীলন করুন",
    "Progress": "অগ্রগতি",
    "XP, level and history": "XP, লেভেল ও ইতিহাস",
    "Feedback": "ফিডব্যাক",
    "Assessment and Bangla hints": "মূল্যায়ন ও বাংলা নির্দেশনা",
    "Instructor assignments": "শিক্ষকের অ্যাসাইনমেন্ট",
    "Open missions": "মিশন খুলুন",
    "Team mission": "টিম মিশন",
    "Team area": "টিম এলাকা",
    "Recent mission activity": "সাম্প্রতিক মিশন কার্যক্রম",
    "Full history": "সম্পূর্ণ ইতিহাস",
    "Loading current mission…": "বর্তমান মিশন লোড হচ্ছে…",
    "Loading assignments…": "অ্যাসাইনমেন্ট লোড হচ্ছে…",
    "Loading team information…": "টিম তথ্য লোড হচ্ছে…",
    "Loading activity…": "কার্যক্রম লোড হচ্ছে…",
    "No active mission": "কোনো সক্রিয় মিশন নেই",
    "Choose your next Git mission and start a fresh sandbox.": "আপনার পরবর্তী গিট মিশন বেছে নিয়ে নতুন স্যান্ডবক্স শুরু করুন।",
    "Open team area": "টিম এলাকা খুলুন",
    "You have not been assigned to a team yet.": "আপনাকে এখনো কোনো টিমে যুক্ত করা হয়নি।",
    "Your Git missions": "আপনার গিট মিশনসমূহ",
    "Each individual mission runs in your own isolated Docker workspace. Submit the real repository state to earn XP.": "প্রতিটি ব্যক্তিগত মিশন আপনার নিজস্ব আলাদা Docker ওয়ার্কস্পেসে চলে। XP পেতে বাস্তব রিপোজিটরি অবস্থা সাবমিট করুন।",
    "View progress": "অগ্রগতি দেখুন",
    "Mission instructions": "মিশন নির্দেশনা",
    "Suggested commands": "প্রস্তাবিত কমান্ড",
    "Submit mission": "মিশন সাবমিট করুন",
    "Reconnect": "পুনরায় সংযোগ",
    "Reset": "রিসেট",
    "Abandon": "ত্যাগ করুন",
    "Clear screen": "স্ক্রিন পরিষ্কার করুন",
    "Run": "চালান",
    "Disconnected": "সংযোগ বিচ্ছিন্ন",
    "No mission selected": "কোনো মিশন নির্বাচন করা হয়নি",
    "Open Missions and click Start or Continue.": "Missions খুলে Start অথবা Continue ক্লিক করুন।",
    "Start or continue a mission from the Missions page. The terminal runs inside your own Docker container.": "Missions পৃষ্ঠা থেকে একটি মিশন শুরু বা চালিয়ে যান। টার্মিনাল আপনার নিজস্ব Docker কনটেইনারে চলে।",
    "Review your GitStack journey": "আপনার GitStack যাত্রা দেখুন",
    "Your level": "আপনার লেভেল",
    "Loading your level…": "আপনার লেভেল লোড হচ্ছে…",
    "Mission history": "মিশন ইতিহাস",
    "Recent feedback": "সাম্প্রতিক ফিডব্যাক",
    "No attempts yet.": "এখনো কোনো প্রচেষ্টা নেই।",
    "No feedback yet": "এখনো কোনো ফিডব্যাক নেই",
    "Submit a mission and GitStack will store validator feedback here.": "একটি মিশন সাবমিট করলে GitStack এখানে ভ্যালিডেটর ফিডব্যাক সংরক্ষণ করবে।",
    "Open mission attempt →": "মিশন প্রচেষ্টা খুলুন →",
    "Your student profile": "আপনার শিক্ষার্থী প্রোফাইল",
    "Profile information": "প্রোফাইল তথ্য",
    "Full name": "পূর্ণ নাম",
    "University ID": "বিশ্ববিদ্যালয় আইডি",
    "University email": "বিশ্ববিদ্যালয়ের ইমেইল",
    "Department": "বিভাগ",
    "Semester": "সেমিস্টার",
    "Save changes": "পরিবর্তন সংরক্ষণ করুন",
    "Change password": "পাসওয়ার্ড পরিবর্তন",
    "Current password": "বর্তমান পাসওয়ার্ড",
    "New password": "নতুন পাসওয়ার্ড",
    "Confirm new password": "নতুন পাসওয়ার্ড নিশ্চিত করুন",
    "Update password": "পাসওয়ার্ড আপডেট করুন",
    "Passwords are Argon2id-hashed. Sensitive profile fields are encrypted with AES-256-GCM before being stored in PostgreSQL.": "পাসওয়ার্ড Argon2id দিয়ে হ্যাশ করা হয়। সংবেদনশীল প্রোফাইল তথ্য PostgreSQL-এ সংরক্ষণের আগে AES-256-GCM দিয়ে এনক্রিপ্ট করা হয়।",
    "Team members": "টিম সদস্য",
    "No team assignment yet": "এখনো কোনো টিম অ্যাসাইনমেন্ট নেই",
    "Your instructor will assign a team for the Gitea collaboration mission. Individual missions remain fully available now.": "Gitea সহযোগিতা মিশনের জন্য আপনার শিক্ষক একটি টিম নির্ধারণ করবেন। ব্যক্তিগত মিশনগুলো এখনই সম্পূর্ণভাবে ব্যবহারযোগ্য।",
    "Continue individual missions": "ব্যক্তিগত মিশন চালিয়ে যান",
    "No team mission assigned yet.": "এখনো কোনো টিম মিশন অ্যাসাইন করা হয়নি।",
    "Instructor": "শিক্ষক",
    "Student": "শিক্ষার্থী",
    "Gitea next phase": "পরবর্তী ধাপ: Gitea",
    "Class progress": "ক্লাস অগ্রগতি",
    "Create team": "টিম তৈরি করুন",
    "Three students, three roles": "তিন শিক্ষার্থী, তিন ভূমিকা",
    "Assign mission": "মিশন অ্যাসাইন করুন",
    "Individual or team assignment": "ব্যক্তিগত বা টিম অ্যাসাইনমেন্ট",
    "Scores and Bangla feedback": "স্কোর ও বাংলা ফিডব্যাক",
    "Recent activity": "সাম্প্রতিক কার্যক্রম",
    "Full activity": "সম্পূর্ণ কার্যক্রম",
    "Common workflow mistakes": "সাধারণ ওয়ার্কফ্লো ভুল",
    "Details": "বিস্তারিত",
    "Recent assignments": "সাম্প্রতিক অ্যাসাইনমেন্ট",
    "Manage assignments": "অ্যাসাইনমেন্ট পরিচালনা করুন",
    "No assessment data yet.": "এখনো কোনো মূল্যায়ন তথ্য নেই।",
    "Loading class progress…": "ক্লাস অগ্রগতি লোড হচ্ছে…",
    "Student detail": "শিক্ষার্থীর বিস্তারিত",
    "Review one student’s complete GitStack learning history.": "একজন শিক্ষার্থীর সম্পূর্ণ GitStack শেখার ইতিহাস দেখুন।",
    "Mission attempts, assessments, XP, instructor assignments and team information.": "মিশন প্রচেষ্টা, মূল্যায়ন, XP, শিক্ষকের অ্যাসাইনমেন্ট ও টিম তথ্য।",
    "Back to students": "শিক্ষার্থী তালিকায় ফিরুন",
    "Students": "শিক্ষার্থীরা",
    "All departments": "সব বিভাগ",
    "All semesters": "সব সেমিস্টার",
    "All students": "সব শিক্ষার্থী",
    "View progress": "অগ্রগতি দেখুন",
    "Assign": "অ্যাসাইন করুন",
    "No team": "কোনো টিম নেই",
    "ACTIVE": "সক্রিয়",
    "Active": "সক্রিয়",
    "Mission catalogue": "মিশন তালিকা",
    "Mission performance": "মিশন পারফরম্যান্স",
    "GitStack uses predefined missions for the MVP. Arbitrary mission-builder functionality is intentionally excluded by the project plan.": "MVP-তে GitStack পূর্বনির্ধারিত মিশন ব্যবহার করে। প্রকল্প পরিকল্পনা অনুযায়ী ইচ্ছামতো মিশন-বিল্ডার রাখা হয়নি।",
    "Mission Assignments": "মিশন অ্যাসাইনমেন্ট",
    "New assignment": "নতুন অ্যাসাইনমেন্ট",
    "Create mission assignment": "মিশন অ্যাসাইনমেন্ট তৈরি করুন",
    "Choose a mission": "একটি মিশন বেছে নিন",
    "Choose mission": "মিশন বেছে নিন",
    "Student / Team": "শিক্ষার্থী / টিম",
    "Start date (optional)": "শুরুর তারিখ (ঐচ্ছিক)",
    "Due date (optional)": "শেষ তারিখ (ঐচ্ছিক)",
    "Create assignment": "অ্যাসাইনমেন্ট তৈরি করুন",
    "Status": "অবস্থা",
    "Due": "শেষ সময়",
    "Starts": "শুরু",
    "Actions": "কাজ",
    "DRAFT": "খসড়া",
    "IN PROGRESS": "চলমান",
    "CLOSED": "বন্ধ",
    "Draft": "খসড়া",
    "Completed": "সম্পন্ন",
    "Team management": "টিম ব্যবস্থাপনা",
    "Every collaboration team has exactly three students: Feature Developer, Test Developer and Code Reviewer.": "প্রতিটি সহযোগিতা টিমে ঠিক তিনজন শিক্ষার্থী থাকে: ফিচার ডেভেলপার, টেস্ট ডেভেলপার এবং কোড রিভিউয়ার।",
    "Collaboration readiness:": "সহযোগিতা প্রস্তুতি:",
    "Team membership and roles are stored now. Gitea repositories, Pull Requests, review events and team scoring will plug into these teams in the next milestone.": "টিম সদস্যপদ ও ভূমিকা এখন সংরক্ষিত হয়। পরবর্তী মাইলস্টোনে Gitea রিপোজিটরি, Pull Request, রিভিউ ইভেন্ট ও টিম স্কোরিং যুক্ত হবে।",
    "Create three-person team": "তিন সদস্যের টিম তৈরি করুন",
    "Edit three-person team": "তিন সদস্যের টিম সম্পাদনা করুন",
    "Team name": "টিমের নাম",
    "Choose three students and assign one unique role to each.": "তিনজন শিক্ষার্থী বেছে নিয়ে প্রত্যেককে আলাদা একটি ভূমিকা দিন।",
    "Save team": "টিম সংরক্ষণ করুন",
    "Cancel": "বাতিল",
    "Feature Developer": "ফিচার ডেভেলপার",
    "Test Developer": "টেস্ট ডেভেলপার",
    "Code Reviewer": "কোড রিভিউয়ার",
    "Assessment results": "মূল্যায়ন ফলাফল",
    "Review automatic individual scores, failed checks and Bangla feedback.": "স্বয়ংক্রিয় ব্যক্তিগত স্কোর, ব্যর্থ চেক ও বাংলা ফিডব্যাক দেখুন।",
    "All missions": "সব মিশন",
    "All results": "সব ফলাফল",
    "Passed": "উত্তীর্ণ",
    "Needs work": "আরও কাজ প্রয়োজন",
    "Score": "স্কোর",
    "Result": "ফলাফল",
    "Attempt": "প্রচেষ্টা",
    "Checks": "চেকসমূহ",
    "Progress & analytics": "অগ্রগতি ও অ্যানালিটিক্স",
    "Progress & Analytics": "অগ্রগতি ও অ্যানালিটিক্স",
    "Completion": "সম্পন্নতার হার",
    "Average score": "গড় স্কোর",
    "Most common failed checks": "সবচেয়ে সাধারণ ব্যর্থ চেক",
    "No mission data yet.": "এখনো কোনো মিশন তথ্য নেই।",
    "No failed assessment checks yet.": "এখনো কোনো ব্যর্থ মূল্যায়ন চেক নেই।",
    "Instructor profile": "শিক্ষক প্রোফাইল",
    "Profile fields are encrypted before PostgreSQL storage. Passwords remain one-way Argon2id hashes.": "প্রোফাইল তথ্য PostgreSQL-এ সংরক্ষণের আগে এনক্রিপ্ট করা হয়। পাসওয়ার্ড একমুখী Argon2id হ্যাশ হিসেবে থাকে।",
    "Designation": "পদবি",
    "Save profile": "প্রোফাইল সংরক্ষণ করুন",
    "Loading…": "লোড হচ্ছে…",
    "Refresh": "রিফ্রেশ",
    "Open analytics": "অ্যানালিটিক্স খুলুন",
    "No activity yet.": "এখনো কোনো কার্যক্রম নেই।",
    /* Authentication and returning-account helper */
    "Previously used account": "আগে ব্যবহৃত অ্যাকাউন্ট",
    "Continue with your saved browser account": "ব্রাউজারে সংরক্ষিত অ্যাকাউন্ট দিয়ে চালিয়ে যান",
    "Use this account": "এই অ্যাকাউন্ট ব্যবহার করুন",
    "Forget": "মুছে দিন",
    "Your browser password manager can fill the password securely. GitStack does not store your password on this device.": "আপনার ব্রাউজারের পাসওয়ার্ড ম্যানেজার নিরাপদে পাসওয়ার্ড পূরণ করতে পারে। GitStack এই ডিভাইসে আপনার পাসওয়ার্ড সংরক্ষণ করে না।",
    "No saved browser password was available. Your account ID has been filled; choose the saved password from your browser if prompted.": "সংরক্ষিত ব্রাউজার পাসওয়ার্ড পাওয়া যায়নি। আপনার অ্যাকাউন্ট আইডি পূরণ করা হয়েছে; ব্রাউজার চাইলে সংরক্ষিত পাসওয়ার্ড নির্বাচন করুন।"
  });

  const phrases = [
    [/Start the /gi, "শুরু করুন: "],
    [/Continue to /gi, "পরবর্তী অংশ: "],
    [/Return to /gi, "ফিরুন: "],
    [/Questions about /gi, "প্রশ্ন: "],
    [/What is /gi, "কী হলো "],
    [/Create and /gi, "তৈরি ও "],
    [/Create /gi, "তৈরি করুন "],
    [/Learn /gi, "শিখুন "],
    [/Practise /gi, "অনুশীলন করুন "],
    [/Practice /gi, "অনুশীলন করুন "],
    [/Work in teams/gi, "টিমে কাজ করুন"],
    [/automatic/gi, "স্বয়ংক্রিয়"],
    [/workflow/gi, "ওয়ার্কফ্লো"],
    [/repository/gi, "রিপোজিটরি"],
    [/branches?/gi, "ব্রাঞ্চ"],
    [/commits?/gi, "কমিট"],
    [/remotes?/gi, "রিমোট"],
    [/missions?/gi, "মিশন"],
    [/teams?/gi, "টিম"],
    [/students?/gi, "শিক্ষার্থী"],
    [/instructors?/gi, "শিক্ষক"],
    [/reviews?/gi, "রিভিউ"],
    [/feedback/gi, "ফিডব্যাক"],
    [/progress/gi, "অগ্রগতি"],
    [/assessment/gi, "মূল্যায়ন"],
    [/errors?/gi, "ত্রুটি"],
    [/completed/gi, "সম্পন্ন"],
    [/complete/gi, "সম্পন্ন"],
    [/safely/gi, "নিরাপদে"],
    [/safe/gi, "নিরাপদ"],
    [/Download/gi, "ডাউনলোড"],
    [/Upload/gi, "আপলোড"],
    [/changes/gi, "পরিবর্তন"],
    [/files/gi, "ফাইল"],
    [/before/gi, "আগে"],
    [/after/gi, "পরে"]
  ];

  const selector = [
    "script", "style", "code", "pre", "svg", "kbd", "samp",
    ".brand-mark", ".xterm", ".terminal-screen", ".terminal-output",
    "[data-no-translate]"
  ].join(",");

  const textState = new WeakMap();
  const attributeState = new WeakMap();
  let applyingLanguage = false;

  function shouldSkip(node) {
    if (!node || !node.nodeValue || !node.nodeValue.trim()) return true;
    const parent = node.parentElement;
    return !parent || Boolean(parent.closest(selector));
  }

  function translateText(text) {
    const leading = text.match(/^\s*/)?.[0] || "";
    const trailing = text.match(/\s*$/)?.[0] || "";
    const core = text.trim();
    if (!core) return text;

    if (Object.prototype.hasOwnProperty.call(exact, core)) {
      return leading + exact[core] + trailing;
    }

    let output = core;
    let changed = false;
    for (const [pattern, replacement] of phrases) {
      const next = output.replace(pattern, replacement);
      if (next !== output) changed = true;
      output = next;
    }

    return leading + (changed ? output : core) + trailing;
  }

  function currentLanguage() {
    return localStorage.getItem("gitstack-language") === "bn" ? "bn" : "en";
  }

  function rememberTextNode(node) {
    if (shouldSkip(node)) return null;
    const existing = textState.get(node);
    if (existing) return existing;
    const state = { original: node.nodeValue, applied: null };
    textState.set(node, state);
    return state;
  }

  function applyTextNode(node, language, mutation = false) {
    if (shouldSkip(node)) return;
    let state = rememberTextNode(node);
    if (!state) return;

    if (mutation && state.applied !== null && node.nodeValue !== state.applied) {
      // Application code changed this node after initial render. Treat the new
      // value as the English source, then immediately re-apply Bangla if needed.
      state.original = node.nodeValue;
    }

    const next = language === "bn" ? translateText(state.original) : state.original;
    state.applied = next;
    if (node.nodeValue !== next) node.nodeValue = next;
  }

  function rememberAttributes(element) {
    if (!element || element.closest?.(selector)) return null;
    let record = attributeState.get(element);
    if (!record) {
      record = {};
      attributeState.set(element, record);
    }
    for (const attribute of ["placeholder", "title", "aria-label"]) {
      if (element.hasAttribute?.(attribute) && !(attribute in record)) {
        record[attribute] = element.getAttribute(attribute);
      }
    }
    return record;
  }

  function applyAttributes(element, language, changedAttribute = null) {
    if (!element || element.closest?.(selector)) return;
    const record = rememberAttributes(element);
    if (!record) return;

    if (changedAttribute && changedAttribute in record) {
      const current = element.getAttribute(changedAttribute);
      const previousApplied = language === "bn" ? translateText(record[changedAttribute]) : record[changedAttribute];
      if (current !== previousApplied) record[changedAttribute] = current;
    }

    for (const [attribute, original] of Object.entries(record)) {
      const next = language === "bn" ? translateText(original) : original;
      if (element.getAttribute(attribute) !== next) element.setAttribute(attribute, next);
    }
  }

  function scan(root = document.body, language = currentLanguage()) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      applyTextNode(root, language);
      return;
    }

    if (root.nodeType !== Node.ELEMENT_NODE && root !== document.body) return;
    if (root.matches?.(selector)) return;

    applyAttributes(root, language);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return shouldSkip(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) applyTextNode(walker.currentNode, language);

    root.querySelectorAll?.("[placeholder], [title], [aria-label]").forEach((element) => {
      applyAttributes(element, language);
    });
  }

  function updateButtons(language) {
    document.querySelectorAll("[data-lang]").forEach((button) => {
      const isActive = button.dataset.lang === language;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function setLanguage(language) {
    const lang = language === "bn" ? "bn" : "en";
    document.documentElement.lang = lang;
    document.body.classList.toggle("lang-bn", lang === "bn");
    localStorage.setItem("gitstack-language", lang);

    applyingLanguage = true;
    try {
      scan(document.body, lang);
      updateButtons(lang);
    } finally {
      queueMicrotask(() => { applyingLanguage = false; });
    }

    document.dispatchEvent(new CustomEvent("gitstack:languagechange", {
      detail: { language: lang }
    }));
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-lang]");
    if (!button) return;
    event.preventDefault();
    setLanguage(button.dataset.lang);
  });

  const observer = new MutationObserver((mutations) => {
    if (applyingLanguage) return;
    const lang = currentLanguage();
    applyingLanguage = true;
    try {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          applyTextNode(mutation.target, lang, true);
          continue;
        }
        if (mutation.type === "attributes") {
          applyAttributes(mutation.target, lang, mutation.attributeName);
          continue;
        }
        mutation.addedNodes.forEach((node) => scan(node, lang));
      }
      updateButtons(lang);
    } finally {
      queueMicrotask(() => { applyingLanguage = false; });
    }
  });

  const savedLanguage = currentLanguage();
  setLanguage(savedLanguage);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["placeholder", "title", "aria-label"]
  });

  window.GitStackLanguage = {
    setLanguage,
    getLanguage: () => localStorage.getItem("gitstack-language") || "en"
  };
})();
