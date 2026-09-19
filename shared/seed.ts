export const CATEGORIES = [
  "CULTURE",
  "SPORTS",
  "TECH",
  "BUSINESS",
  "INTERNET",
  "LIFE",
  "SCIENCE",
  "ENTERTAINMENT",
  "ABSURD",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type ReceiptStatus = "LOCKED" | "PENDING" | "RIGHT" | "WRONG" | "PARTIALLY RIGHT" | "TOO EARLY";
export type ReceiptVisibility = "PUBLIC" | "PRIVATE";

export const DAILY_PROMPTS: Array<{ prompt: string; category: Category; resolutionDays: number }> = [
  { prompt: "Will a major movie released this month cross $500M worldwide?", category: "ENTERTAINMENT", resolutionDays: 45 },
  { prompt: "Will the next big app trend make everyone add a widget to their home screen?", category: "TECH", resolutionDays: 30 },
  { prompt: "Will a team currently outside the top four finish the season in a playoff spot?", category: "SPORTS", resolutionDays: 60 },
  { prompt: "Will a brand launch a product that makes the internet say ‘who asked for this?’", category: "CULTURE", resolutionDays: 21 },
  { prompt: "Will the next viral dance be impossible to do without looking at a tutorial?", category: "INTERNET", resolutionDays: 14 },
  { prompt: "Will someone in your group chat send a screenshot instead of a link this week?", category: "LIFE", resolutionDays: 7 },
  { prompt: "Will a streaming service announce a reboot of a show people thought was finished forever?", category: "ENTERTAINMENT", resolutionDays: 30 },
  { prompt: "Will a new AI feature be announced with the words ‘it feels like magic’?", category: "TECH", resolutionDays: 30 },
  { prompt: "Will an underdog win a game by at least 10 points this weekend?", category: "SPORTS", resolutionDays: 7 },
  { prompt: "Will a celebrity start a podcast that is somehow also a lifestyle brand?", category: "CULTURE", resolutionDays: 45 },
  { prompt: "Will a meme from this week still be recognizable in six months?", category: "INTERNET", resolutionDays: 180 },
  { prompt: "Will you reorganize something instead of doing the task you planned today?", category: "LIFE", resolutionDays: 1 },
  { prompt: "Will a snack brand release a limited edition flavor people defend online?", category: "BUSINESS", resolutionDays: 30 },
  { prompt: "Will the next widely shared science headline use the word ‘surprising’?", category: "SCIENCE", resolutionDays: 21 },
  { prompt: "Will a live event have a technical problem that becomes part of the show?", category: "CULTURE", resolutionDays: 30 },
  { prompt: "Will a major app change its icon before it changes the feature users asked for?", category: "TECH", resolutionDays: 45 },
  { prompt: "Will the team with the louder social media account win its next big match?", category: "SPORTS", resolutionDays: 14 },
  { prompt: "Will a new show get called ‘the next big thing’ before its second episode?", category: "ENTERTAINMENT", resolutionDays: 21 },
  { prompt: "Will someone reply ‘this’ to a post instead of adding a new thought?", category: "INTERNET", resolutionDays: 3 },
  { prompt: "Will you find a forgotten note, tab, or screenshot that answers a question you had?", category: "LIFE", resolutionDays: 14 },
  { prompt: "Will a company announce a four-day workweek pilot that gets everyone debating?", category: "BUSINESS", resolutionDays: 60 },
  { prompt: "Will a space image make your feed briefly feel tiny and huge at the same time?", category: "SCIENCE", resolutionDays: 30 },
  { prompt: "Will a sequel get announced before the original has left the cultural conversation?", category: "ENTERTAINMENT", resolutionDays: 60 },
  { prompt: "Will a new gadget be described as ‘the future’ and ‘a little weird’ in the same week?", category: "TECH", resolutionDays: 14 },
  { prompt: "Will a team win after trailing at halftime in a nationally watched game?", category: "SPORTS", resolutionDays: 30 },
  { prompt: "Will someone post a photo of their meal with a caption that is longer than the recipe?", category: "INTERNET", resolutionDays: 7 },
  { prompt: "Will an everyday object get a luxury version nobody technically needs?", category: "BUSINESS", resolutionDays: 45 },
  { prompt: "Will your next ‘quick errand’ take more than an hour?", category: "LIFE", resolutionDays: 14 },
  { prompt: "Will a study about sleep inspire people to stay up late reading about sleep?", category: "SCIENCE", resolutionDays: 21 },
  { prompt: "Will an actor become briefly known for one very specific reaction GIF?", category: "CULTURE", resolutionDays: 90 },
  { prompt: "Will the phrase ‘quiet luxury’ show up in a headline this week?", category: "CULTURE", resolutionDays: 7 },
  { prompt: "Will a product update fix one thing and accidentally create a new group chat complaint?", category: "TECH", resolutionDays: 14 },
  { prompt: "Will a rookie score or perform the moment people stop calling them a rookie?", category: "SPORTS", resolutionDays: 45 },
  { prompt: "Will a reality show contestant become an unlikely business mogul?", category: "ENTERTAINMENT", resolutionDays: 120 },
  { prompt: "Will a comment section turn a normal word into a temporary inside joke?", category: "INTERNET", resolutionDays: 10 },
  { prompt: "Will you buy a thing because the packaging made it feel like a personality?", category: "LIFE", resolutionDays: 30 },
  { prompt: "Will a company rename a familiar product and immediately explain that it is still the same product?", category: "BUSINESS", resolutionDays: 45 },
  { prompt: "Will a new discovery make people casually say ‘we really do not know much’?", category: "SCIENCE", resolutionDays: 30 },
  { prompt: "Will a movie trailer reveal the best joke before the movie does?", category: "ENTERTAINMENT", resolutionDays: 30 },
  { prompt: "Will someone make a spreadsheet for something that absolutely did not need a spreadsheet?", category: "LIFE", resolutionDays: 14 },
  { prompt: "Will the phrase ‘main character energy’ be used sincerely this week?", category: "INTERNET", resolutionDays: 7 },
  { prompt: "Will a startup announce a product with no obvious reason to exist?", category: "BUSINESS", resolutionDays: 45 },
  { prompt: "Will a science headline trigger at least one ‘can someone explain this?’ post?", category: "SCIENCE", resolutionDays: 14 },
  { prompt: "Will a sports fan confidently predict a comeback before the comeback happens?", category: "SPORTS", resolutionDays: 30 },
  { prompt: "Will a beloved character return in a way that starts an argument?", category: "ENTERTAINMENT", resolutionDays: 60 },
  { prompt: "Will the internet collectively misread a headline before reading the article?", category: "INTERNET", resolutionDays: 7 },
  { prompt: "Will you say ‘I should write that down’ and then not write it down?", category: "LIFE", resolutionDays: 3 },
  { prompt: "Will a company call a normal feature ‘an experience’?", category: "BUSINESS", resolutionDays: 30 },
  { prompt: "Will a researcher explain that the result is more complicated than the headline?", category: "SCIENCE", resolutionDays: 21 },
  { prompt: "Will an ordinary household item become a collector’s item for a completely unexpected reason?", category: "ABSURD", resolutionDays: 90 },
  { prompt: "Will someone confidently predict the weather and be wrong within 24 hours?", category: "ABSURD", resolutionDays: 1 },
  { prompt: "Will a pigeon, raccoon, or goose become the internet’s main character?", category: "ABSURD", resolutionDays: 30 },
];

export const DEMO_RECEIPTS = [
  { id: "demo-4821", receiptNumber: "004821", username: "Brianna", prediction: "I’ll still be working here one year from today.", category: "LIFE" as Category, confidence: 80, status: "LOCKED" as ReceiptStatus, resolutionDate: "09/18/2027", createdAt: "09/18/2026" },
  { id: "demo-4818", receiptNumber: "004818", username: "Marcus", prediction: "This tiny app will become the group chat’s new obsession.", category: "INTERNET" as Category, confidence: 65, status: "RIGHT" as ReceiptStatus, resolutionDate: "08/31/2026", createdAt: "08/01/2026" },
  { id: "demo-4814", receiptNumber: "004814", username: "Nia", prediction: "I will absolutely not buy another notebook this month.", category: "ABSURD" as Category, confidence: 95, status: "WRONG" as ReceiptStatus, resolutionDate: "09/01/2026", createdAt: "08/04/2026" },
];

export function getTodayPrompt() {
  const day = Math.floor(Date.now() / 86_400_000);
  return DAILY_PROMPTS[((day % DAILY_PROMPTS.length) + DAILY_PROMPTS.length) % DAILY_PROMPTS.length];
}

export function formatReceiptNumber(id: number | string) {
  const numeric = typeof id === "number" ? id : Number(id.replace(/\D/g, ""));
  return String(Number.isFinite(numeric) ? numeric : 4821).padStart(6, "0");
}
