// Words on screen: atlas lines, job cards, the teacher's "what to do now" line
// and each group's "Your job now" line. Grade 8 reading level. No em dashes.

export const ATLAS = {
  westhaven: "Rain falls on cedar forests west of the Spine Mountains, and ships from across the Western Sea crowd the harbour at Port Corran.",
  ridgeland: "East of the mountains the land turns dry and wide, and oil wells and cattle ranches share the foothills around Northgate.",
  goldplain: "Wheat and canola roll to the edge of the sky, and grain trains rumble out of Prairie Junction toward both coasts.",
  lakemoor: "Factories, banks and busy streets crowd the shores of the great lakes, home to the most people in Borealis and to the capital, Corvell.",
  valcourt: "The great Valcourt River runs past dams and aluminum plants to the gulf, and its people share their own language and culture.",
  saltmarch: "Fishing boats and shipyards fill the rocky coves and islands of the Eastern Sea, where families have lived for generations.",
  northreach: "Rock, lakes and tundra stretch to the Northern Sea, with rich mines and small towns spread across the largest province by far.",
};

export const ROLES_P1 = [
  { id: "premier", name: "Premier", text: "You lead. Hear everyone, then make the final call. You speak for your province at the board." },
  { id: "finance", name: "Finance Minister", text: "You hold the money. Set taxes and spending. Check every choice against the budget and the debt." },
  { id: "trade", name: "Trade Minister", text: "You get what your province is short on. Make fair deals on the trade floor. Keep your promises." },
  { id: "advocate", name: "Citizens' Advocate", text: "You speak for the people. Read the local issue. Ask: who wins, who loses? Present the province report." },
];

export const ROLES_P2 = [
  { name: "Party Leader", text: "Members elect you. Run the caucus. Give the debate pitch." },
  { name: "Platform Chair", text: "Turn your party's ideas into 3 clear promises with a price tag." },
  { name: "Campaign Manager", text: "Plan where to campaign. Spend your actions wisely." },
  { name: "Whip", text: "Keep members on the party's message. Count votes before a vote." },
  { name: "All members", text: "You are a party member. You vote for the leader, the priorities, and your riding's candidate." },
];

// Teacher line under the board. ctl gives access to the game.
export function nowLine(s, ctl) {
  const open = (kind) => ctl.pendingProvinces(kind).length;
  switch (s.step) {
    case "launch": return "Show the join code. Each group joins its province on one device, or uses paper slips. Then press Start Year 1.";
    case "headline": return !s.yc.event ? "A calm year: no national event. Swap one in if you want, or press Next for Income." : !s.yc.revealed ? "Read the headline aloud. Press Reveal headline when the class is ready." : "Ask: who does this help, who does it hurt? Then press Next for Income.";
    case "income": return "Groups check what they make and need. Point out the red Short tags on the map. Press Next to open trading.";
    case "trade": return `Trade Ministers make deals (${s.trades.filter((t) => !t.undone).length} so far). Paper deals: use the Trade Desk. Press Next to close trading.`;
    case "local": return open("local") ? `${7 - open("local")} of 7 provinces have chosen. Tap a province to enter a paper slip.` : "All provinces have chosen. Press Next for the Budget.";
    case "budget": return open("budget") ? `${7 - open("budget")} of 7 budgets confirmed. Hear Budget Speeches and tap a province to give points.` : "All budgets are in. Give Budget Speech points, then press Next for results.";
    case "results": return "Tap a province to show why approval changed. You can still change Budget Speech points. Then ledgers.";
    case "review": return "State of the Province reports. Each Citizens' Advocate presents for 2 minutes.";
    case "crisis": return "Show the fallen bridge. Ask: who uses it? Who should pay? Press Next to start secret pledges.";
    case "pledge1": return "Each province pledges in secret on its device or a slip. Press Next to reveal the total.";
    case "reveal": return "Read the total against $60B. Ask who pledged little but still uses the bridge.";
    case "pledge2": return "Open round. Pledges show live. Let groups argue, then press Next for the outcome.";
    case "outcome": return "Run Four Ways to Decide. Then press Start Phase 2: Borealis founds a Parliament.";
    case "parties": return "Hand out party cards and secret slips. Enter member counts, leaders and priority rankings for each party.";
    case "platform": return "Each caucus sets its platform levers, picks a regional promise and confirms riding candidates.";
    case "campaign": return "Parties spend campaign actions on devices or here. After the debate, tap parties in endorsement order.";
    case "election": return "Watch the ridings light up. Ask: majority or minority? Compare vote share and seat share.";
    case "vote": return "Run the Student Vote. Students vote on their riding's device, or on paper and you enter the counts here.";
    case "government": return s.p2.gov?.majority ? "Invite the leader to form government. Pick Cabinet, shadow cabinet and 3 senators." : "Minority: hold the confidence vote on the Throne Speech. Partners can trade support for a promise.";
    case "bill": return ["Cabinet drafts C-1 from its platform. Edit the levers here or on the government device.", "Read the title. The bill is now public.", "Debate and Question Period. Score each question and answer.", "Each opposition party may move one amendment. Set the votes.", "Set each party's vote and the class show of hands.", "The Senate may send back one change.", "Give Royal Assent. Press Run Year 7."][s.p2.bill?.stage ?? 0];
    case "year7": return "Year 7 shows the federal budget reaching every province. Tap a province to see its federal part.";
    case "debrief": return "Open the history log. Run the Budget Defence.";
  }
  return "";
}

// Group task line ("Your job now: ...")
export function groupTask(s, kind, me, extra = {}) {
  if (s.paused) return { who: "Everyone", text: "Eyes up. Look at the board." };
  if (kind === "party") {
    switch (s.step) {
      case "parties": return { who: "Caucus", text: "Vote for your leader. Then each member ranks the 4 promises on this device." };
      case "platform": return { who: "Platform Chair", text: "Set your budget levers. Pick a regional promise. Confirm a candidate in each province." };
      case "campaign": return { who: "Campaign Manager", text: "Spend your campaign actions where they matter most." };
      case "vote": return { who: "Everyone", text: "Vote at the polling table in your home riding. Bring your riding card." };
      case "election": return { who: "Everyone", text: "Watch the results on the board. Count your seats." };
      case "government": return extra.isGov ? { who: "Prime Minister", text: "Pick your Cabinet. Win the confidence vote if you need it." } : { who: "Whip", text: "Decide how your party votes on the Throne Speech." };
      case "bill": return extra.isGov ? { who: "Cabinet", text: "Draft and defend the budget bill C-1." } : { who: "Critics", text: "Find weak spots. Ask questions. Move one amendment." };
      case "year7": return { who: "Everyone", text: "See how the federal budget changed your home province." };
      default: return { who: "Everyone", text: "Look at the board." };
    }
  }
  if (s.phase === "p2" && s.step === "vote") return { who: "Every voter", text: "Show your riding card. Vote in secret, one person at a time." };
  if (s.phase === "p2" || s.phase === "debrief") return { who: "Everyone", text: "Join your party caucus. Your province is still your riding." };
  switch (s.step) {
    case "launch": return { who: "Everyone", text: "Read your province profile. Find what you are short on." };
    case "headline": return { who: "Everyone", text: "Look up at the board. Listen to the headline." };
    case "income": return { who: "Premier", text: "Check what you make and what you need. What are you short on?" };
    case "trade": return { who: "Trade Minister", text: "Get what you are short on. Make fair deals with other provinces." };
    case "local": return { who: "Citizens' Advocate", text: "Read your local issue. Who wins? Who loses? Pick one choice." };
    case "budget": return { who: "Finance Minister", text: "Set taxes and spending. Watch the surplus or deficit. Then confirm." };
    case "results": return { who: "Everyone", text: "See why your approval changed. Write your ledger line." };
    case "review": return { who: "Citizens' Advocate", text: "Get ready for your State of the Province report." };
    case "crisis": return { who: "Everyone", text: "The bridge has fallen. Who uses it? Who should pay?" };
    case "pledge1": return { who: "Premier", text: "Decide your secret pledge for the new bridge." };
    case "reveal": return { who: "Everyone", text: "Look at the total on the board." };
    case "pledge2": return { who: "Premier", text: "Change your pledge if you want. Everyone can see it now." };
    case "outcome": return { who: "Everyone", text: "Who should decide for all of Borealis?" };
    default: return { who: "Everyone", text: "Join your party caucus. Your province is still your riding." };
  }
}
