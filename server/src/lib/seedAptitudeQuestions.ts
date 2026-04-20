// Hand-written aptitude question bank — ~15 per category, 8 categories.
// Idempotent: looks up each question by its unique `prompt` text and
// upserts. Safe to re-run after code changes.
//
// No AI/LLM calls. Every prompt, options array, correctIndex, and
// explanation was authored manually.

import { prisma } from './prisma.js';
import type { AptitudeCategory } from '@prisma/client';

type SeedQ = {
  category: AptitudeCategory;
  prompt: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
  difficulty?: 1 | 2 | 3;
  estimatedSeconds?: number;
};

const QUESTIONS: SeedQ[] = [
  // =====================================================================
  // GMAT — Verbal (sentence correction + critical reasoning)
  // =====================================================================
  {
    category: 'GMAT_VERBAL',
    prompt: 'Select the best version of the underlined portion: "Neither the manager nor her assistants WAS AWARE of the policy change."',
    options: ['A) was aware', 'B) were aware', 'C) is aware', 'D) had been aware'],
    correctIndex: 1,
    explanation: 'With "neither/nor", the verb agrees with the noun closest to it. "Assistants" is plural, so use "were aware".',
    difficulty: 2,
    estimatedSeconds: 60
  },
  {
    category: 'GMAT_VERBAL',
    prompt: 'Choose the grammatically correct sentence.',
    options: [
      'A) The number of applicants have increased sharply this year.',
      'B) The number of applicants has increased sharply this year.',
      'C) A number of applicants has increased sharply this year.',
      'D) The number of applicants increasing sharply this year.'
    ],
    correctIndex: 1,
    explanation: '"The number" is singular and takes "has". "A number" would be plural and take "have".',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'GMAT_VERBAL',
    prompt: 'A study found that cities that banned plastic bags saw a 40% drop in coastal litter within two years. Which assumption does the conclusion that "plastic bag bans reduce coastal litter" depend on?',
    options: [
      'A) Plastic bags were a meaningful share of pre-ban coastal litter.',
      'B) Other types of litter remained constant.',
      'C) Residents complied with the ban without enforcement.',
      'D) The study tracked only beach areas.'
    ],
    correctIndex: 0,
    explanation: 'For the ban to *cause* the drop, plastic bags must have been a real component of the original litter. Otherwise the drop is coincidence.',
    difficulty: 3,
    estimatedSeconds: 90
  },
  {
    category: 'GMAT_VERBAL',
    prompt: 'Which sentence uses the modifier correctly?',
    options: [
      'A) Walking down the street, the building looked enormous.',
      'B) Walking down the street, I thought the building looked enormous.',
      'C) The building, walking down the street, looked enormous.',
      'D) Walking down the street, enormous looked the building.'
    ],
    correctIndex: 1,
    explanation: 'A dangling modifier must attach to the noun doing the action. "I" was walking, not the building.',
    difficulty: 1,
    estimatedSeconds: 45
  },
  {
    category: 'GMAT_VERBAL',
    prompt: 'A newspaper reports: "Coffee drinkers live longer than non-coffee drinkers, so drinking coffee extends life." Which choice most weakens this argument?',
    options: [
      'A) Coffee contains antioxidants.',
      'B) Coffee drinkers are wealthier on average and have better healthcare access.',
      'C) Tea drinkers also live longer than non-drinkers.',
      'D) Caffeine is mildly addictive.'
    ],
    correctIndex: 1,
    explanation: 'Wealth is a confounding variable: coffee drinkers may live longer because of healthcare, not coffee. Correlation ≠ causation.',
    difficulty: 2,
    estimatedSeconds: 75
  },
  {
    category: 'GMAT_VERBAL',
    prompt: 'Choose the best version: "The committee decided that each of the proposals __ careful review."',
    options: ['A) deserve', 'B) deserves', 'C) are deserving', 'D) have deserved'],
    correctIndex: 1,
    explanation: '"Each" is singular, so the verb is "deserves". The intervening "of the proposals" doesn\'t change the subject.',
    difficulty: 1,
    estimatedSeconds: 40
  },
  {
    category: 'GMAT_VERBAL',
    prompt: 'Which version is parallel? "The intern was responsible for filing reports, answering calls, and ____."',
    options: [
      'A) to schedule meetings',
      'B) the scheduling of meetings',
      'C) scheduling meetings',
      'D) she scheduled meetings'
    ],
    correctIndex: 2,
    explanation: 'Parallel structure with "filing… answering…" requires a third "-ing" gerund: "scheduling meetings".',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'GMAT_VERBAL',
    prompt: 'A CEO claims a new training program is responsible for a 15% productivity increase. Which finding most strengthens this claim?',
    options: [
      'A) Employees rated the training "excellent" in a survey.',
      'B) A control group of untrained employees in the same period showed no productivity change.',
      'C) The training cost less than expected.',
      'D) Productivity is also up at competitors.'
    ],
    correctIndex: 1,
    explanation: 'A control group rules out other factors. If untrained peers didn\'t improve, the training is the most likely cause.',
    difficulty: 2,
    estimatedSeconds: 75
  },
  {
    category: 'GMAT_VERBAL',
    prompt: 'Pick the best version: "Between you and __, the contract is unfair."',
    options: ['A) I', 'B) myself', 'C) me', 'D) mine'],
    correctIndex: 2,
    explanation: '"Between" is a preposition; pronouns following prepositions take the objective case ("me"), not the subjective ("I").',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'GMAT_VERBAL',
    prompt: 'Which is most concise without losing meaning?',
    options: [
      'A) Due to the fact that it was raining, we cancelled.',
      'B) Owing to the rain falling at the time, we cancelled.',
      'C) Because it was raining, we cancelled.',
      'D) On account of the existence of rain, we cancelled.'
    ],
    correctIndex: 2,
    explanation: 'GMAT prefers concise prose. "Because it was raining" beats wordier alternatives.',
    difficulty: 1,
    estimatedSeconds: 40
  },
  {
    category: 'GMAT_VERBAL',
    prompt: 'A tech firm argues: "Our chatbot resolved 80% of tickets last quarter, so it has cut support costs by 80%." What gap exists in this reasoning?',
    options: [
      'A) Resolution rate and cost are not the same metric.',
      'B) Customers may dislike chatbots.',
      'C) The chatbot is a sunk cost.',
      'D) Tickets vary in complexity.'
    ],
    correctIndex: 0,
    explanation: 'Resolving 80% of tickets doesn\'t mean cost fell 80% — fixed costs (engineers, infra) and the cost-mix of resolved vs unresolved tickets matter.',
    difficulty: 3,
    estimatedSeconds: 90
  },
  {
    category: 'GMAT_VERBAL',
    prompt: 'Choose the correct comparison: "The output of the new turbine is greater than __."',
    options: [
      'A) the old turbine',
      'B) that of the old turbine',
      'C) those of the old turbine',
      'D) the old turbine\'s ones'
    ],
    correctIndex: 1,
    explanation: 'You must compare like to like: output to output. "That of" stands in for "the output of".',
    difficulty: 2,
    estimatedSeconds: 55
  },
  {
    category: 'GMAT_VERBAL',
    prompt: 'Identify the redundancy.',
    options: [
      'A) She returned back to the office.',
      'B) She returned to the office.',
      'C) She went back to the office.',
      'D) She came back to the office.'
    ],
    correctIndex: 0,
    explanation: '"Return" already means "go back", so "returned back" is redundant.',
    difficulty: 1,
    estimatedSeconds: 30
  },
  {
    category: 'GMAT_VERBAL',
    prompt: 'A politician argues that crime fell because of a new curfew. Which finding most undermines this?',
    options: [
      'A) Crime fell in neighbouring towns without curfews by the same amount.',
      'B) The curfew was popular in polls.',
      'C) The curfew was strictly enforced.',
      'D) Crime had been rising before the curfew.'
    ],
    correctIndex: 0,
    explanation: 'If towns *without* the curfew saw the same drop, something else is driving it — the curfew likely isn\'t the cause.',
    difficulty: 2,
    estimatedSeconds: 75
  },
  {
    category: 'GMAT_VERBAL',
    prompt: 'Pick the best version: "Not only did she design the system, ___ she also wrote the documentation."',
    options: ['A) and', 'B) but', 'C) or', 'D) yet'],
    correctIndex: 1,
    explanation: 'The idiom is "not only X but (also) Y". "But" is required.',
    difficulty: 1,
    estimatedSeconds: 35
  },

  // =====================================================================
  // GMAT — Quant (problem solving)
  // =====================================================================
  {
    category: 'GMAT_QUANT',
    prompt: 'If 3x + 7 = 22, what is x?',
    options: ['A) 3', 'B) 5', 'C) 7', 'D) 15'],
    correctIndex: 1,
    explanation: '3x = 22 − 7 = 15, so x = 5.',
    difficulty: 1,
    estimatedSeconds: 40
  },
  {
    category: 'GMAT_QUANT',
    prompt: 'A jacket originally costs GHS 200. After a 25% discount, what is the sale price?',
    options: ['A) GHS 150', 'B) GHS 160', 'C) GHS 175', 'D) GHS 50'],
    correctIndex: 0,
    explanation: '25% of 200 is 50. Sale price = 200 − 50 = GHS 150.',
    difficulty: 1,
    estimatedSeconds: 40
  },
  {
    category: 'GMAT_QUANT',
    prompt: 'If the average (arithmetic mean) of 5 numbers is 12, what is their sum?',
    options: ['A) 12', 'B) 17', 'C) 60', 'D) 5'],
    correctIndex: 2,
    explanation: 'Mean = sum ÷ count, so sum = mean × count = 12 × 5 = 60.',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'GMAT_QUANT',
    prompt: 'A train travels 300 km in 4 hours. At the same average speed, how far will it travel in 7 hours?',
    options: ['A) 425 km', 'B) 500 km', 'C) 525 km', 'D) 600 km'],
    correctIndex: 2,
    explanation: 'Speed = 300/4 = 75 km/h. Distance in 7h = 75 × 7 = 525 km.',
    difficulty: 1,
    estimatedSeconds: 50
  },
  {
    category: 'GMAT_QUANT',
    prompt: 'If x² = 49 and x < 0, what is x?',
    options: ['A) 7', 'B) −7', 'C) ±7', 'D) 49'],
    correctIndex: 1,
    explanation: 'Both 7 and −7 square to 49, but the constraint x < 0 forces x = −7.',
    difficulty: 2,
    estimatedSeconds: 45
  },
  {
    category: 'GMAT_QUANT',
    prompt: 'A right triangle has legs of 6 and 8. What is the hypotenuse?',
    options: ['A) 10', 'B) 12', 'C) 14', 'D) √48'],
    correctIndex: 0,
    explanation: 'Pythagoras: √(6² + 8²) = √(36+64) = √100 = 10. (The classic 6-8-10 triple.)',
    difficulty: 1,
    estimatedSeconds: 45
  },
  {
    category: 'GMAT_QUANT',
    prompt: 'Working alone, A finishes a job in 6 hours and B in 12 hours. How long will they take working together?',
    options: ['A) 3 hours', 'B) 4 hours', 'C) 5 hours', 'D) 9 hours'],
    correctIndex: 1,
    explanation: 'Combined rate = 1/6 + 1/12 = 3/12 = 1/4 job/hour, so 4 hours together.',
    difficulty: 2,
    estimatedSeconds: 75
  },
  {
    category: 'GMAT_QUANT',
    prompt: 'If 20% of a number is 30, what is 50% of the same number?',
    options: ['A) 60', 'B) 75', 'C) 100', 'D) 150'],
    correctIndex: 1,
    explanation: 'The number is 30/0.20 = 150. 50% of 150 = 75.',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'GMAT_QUANT',
    prompt: 'A box has 3 red and 5 blue balls. If one ball is drawn at random, what is the probability it is red?',
    options: ['A) 3/8', 'B) 3/5', 'C) 5/8', 'D) 1/3'],
    correctIndex: 0,
    explanation: 'P(red) = favourable / total = 3 / (3+5) = 3/8.',
    difficulty: 1,
    estimatedSeconds: 40
  },
  {
    category: 'GMAT_QUANT',
    prompt: 'The ratio of boys to girls in a class is 3:5. If there are 24 boys, how many girls are there?',
    options: ['A) 15', 'B) 30', 'C) 40', 'D) 45'],
    correctIndex: 2,
    explanation: '24 boys = 3 parts, so 1 part = 8. Girls = 5 × 8 = 40.',
    difficulty: 1,
    estimatedSeconds: 50
  },
  {
    category: 'GMAT_QUANT',
    prompt: 'If 2^x = 32, what is x?',
    options: ['A) 4', 'B) 5', 'C) 6', 'D) 16'],
    correctIndex: 1,
    explanation: '2^5 = 32, so x = 5.',
    difficulty: 1,
    estimatedSeconds: 30
  },
  {
    category: 'GMAT_QUANT',
    prompt: 'A car depreciates 20% per year. After 2 years, what fraction of its original value remains?',
    options: ['A) 60%', 'B) 64%', 'C) 70%', 'D) 80%'],
    correctIndex: 1,
    explanation: 'After year 1: 0.8. After year 2: 0.8 × 0.8 = 0.64 = 64%.',
    difficulty: 2,
    estimatedSeconds: 60
  },
  {
    category: 'GMAT_QUANT',
    prompt: 'Solve for x: 2(x − 3) + 4 = 16.',
    options: ['A) 5', 'B) 6', 'C) 7', 'D) 9'],
    correctIndex: 3,
    explanation: 'Subtract 4: 2(x−3) = 12. Divide by 2: x−3 = 6. Add 3: x = 9.',
    difficulty: 2,
    estimatedSeconds: 55
  },
  {
    category: 'GMAT_QUANT',
    prompt: 'How many distinct ways can the letters in "TEAM" be arranged?',
    options: ['A) 12', 'B) 16', 'C) 24', 'D) 48'],
    correctIndex: 2,
    explanation: '4 distinct letters → 4! = 24 arrangements.',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'GMAT_QUANT',
    prompt: 'If a + b = 10 and a − b = 4, what is a?',
    options: ['A) 3', 'B) 5', 'C) 7', 'D) 8'],
    correctIndex: 2,
    explanation: 'Add the equations: 2a = 14, so a = 7. (Then b = 3.)',
    difficulty: 1,
    estimatedSeconds: 40
  },

  // =====================================================================
  // GRE — Verbal (text completion + analogy-style)
  // =====================================================================
  {
    category: 'GRE_VERBAL',
    prompt: 'Despite his ____ reputation, the professor delivered a surprisingly engaging lecture.',
    options: ['A) eloquent', 'B) soporific', 'C) dynamic', 'D) animated'],
    correctIndex: 1,
    explanation: '"Despite" signals contrast with "engaging". "Soporific" (sleep-inducing) is the opposite of engaging — the right contrast.',
    difficulty: 2,
    estimatedSeconds: 55
  },
  {
    category: 'GRE_VERBAL',
    prompt: 'The senator\'s speech was marked by ____ — vague phrases that obscured rather than illuminated.',
    options: ['A) candor', 'B) specificity', 'C) circumlocution', 'D) brevity'],
    correctIndex: 2,
    explanation: '"Circumlocution" means using many words to avoid being direct — exactly what "vague phrases that obscured" describes.',
    difficulty: 3,
    estimatedSeconds: 65
  },
  {
    category: 'GRE_VERBAL',
    prompt: 'Choose the word most nearly opposite in meaning to "ephemeral".',
    options: ['A) brief', 'B) lasting', 'C) hidden', 'D) translucent'],
    correctIndex: 1,
    explanation: '"Ephemeral" means short-lived. Its antonym is "lasting" or enduring.',
    difficulty: 2,
    estimatedSeconds: 40
  },
  {
    category: 'GRE_VERBAL',
    prompt: 'The CEO\'s ____ remarks cost the company millions in legal fees.',
    options: ['A) prudent', 'B) judicious', 'C) intemperate', 'D) measured'],
    correctIndex: 2,
    explanation: '"Intemperate" means lacking restraint — the kind of remarks that would trigger lawsuits. The other options imply restraint.',
    difficulty: 2,
    estimatedSeconds: 55
  },
  {
    category: 'GRE_VERBAL',
    prompt: 'Choose the word most nearly synonymous with "ubiquitous".',
    options: ['A) rare', 'B) ancient', 'C) omnipresent', 'D) impressive'],
    correctIndex: 2,
    explanation: '"Ubiquitous" and "omnipresent" both mean existing everywhere at once.',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'GRE_VERBAL',
    prompt: 'The committee\'s decision was ____: every member voted in favour.',
    options: ['A) divisive', 'B) tentative', 'C) unanimous', 'D) reluctant'],
    correctIndex: 2,
    explanation: '"Every member voted in favour" defines unanimous.',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'GRE_VERBAL',
    prompt: 'Choose the word most nearly opposite in meaning to "verbose".',
    options: ['A) wordy', 'B) terse', 'C) loud', 'D) eloquent'],
    correctIndex: 1,
    explanation: '"Verbose" means using too many words. "Terse" means brief and to the point — the opposite.',
    difficulty: 2,
    estimatedSeconds: 40
  },
  {
    category: 'GRE_VERBAL',
    prompt: 'The historian was praised for her ____ research — she examined every available primary source.',
    options: ['A) cursory', 'B) perfunctory', 'C) meticulous', 'D) hasty'],
    correctIndex: 2,
    explanation: '"Examined every primary source" describes meticulous (extremely careful) work. The other options mean superficial.',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'GRE_VERBAL',
    prompt: 'A person who is "laconic" is one who:',
    options: ['A) speaks very little', 'B) is easily angered', 'C) is highly emotional', 'D) avoids responsibility'],
    correctIndex: 0,
    explanation: '"Laconic" describes a person of few words.',
    difficulty: 2,
    estimatedSeconds: 40
  },
  {
    category: 'GRE_VERBAL',
    prompt: 'Choose the word that best completes: "His ____ for detail made him an excellent auditor."',
    options: ['A) aversion', 'B) penchant', 'C) dread', 'D) indifference'],
    correctIndex: 1,
    explanation: '"Penchant" means a strong liking. An auditor who likes detail is excellent — the others are negatives.',
    difficulty: 2,
    estimatedSeconds: 45
  },
  {
    category: 'GRE_VERBAL',
    prompt: '"Ameliorate" most nearly means:',
    options: ['A) worsen', 'B) ignore', 'C) improve', 'D) destroy'],
    correctIndex: 2,
    explanation: '"Ameliorate" means to make a bad situation better — to improve.',
    difficulty: 1,
    estimatedSeconds: 30
  },
  {
    category: 'GRE_VERBAL',
    prompt: 'The novel\'s plot was so ____ that even devoted readers struggled to follow it.',
    options: ['A) lucid', 'B) labyrinthine', 'C) straightforward', 'D) trite'],
    correctIndex: 1,
    explanation: '"Devoted readers struggled" implies extreme complexity. "Labyrinthine" (maze-like) fits.',
    difficulty: 3,
    estimatedSeconds: 55
  },
  {
    category: 'GRE_VERBAL',
    prompt: 'Choose the word most nearly synonymous with "candid".',
    options: ['A) deceitful', 'B) forthright', 'C) reserved', 'D) sarcastic'],
    correctIndex: 1,
    explanation: '"Candid" means honest and direct, like "forthright".',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'GRE_VERBAL',
    prompt: 'Despite the team\'s ____, they ultimately failed to meet their quarterly target.',
    options: ['A) lethargy', 'B) indifference', 'C) diligence', 'D) negligence'],
    correctIndex: 2,
    explanation: '"Despite" sets up contrast with failure. Diligence (careful effort) is the opposite of failure — the right contrast.',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'GRE_VERBAL',
    prompt: '"Esoteric" most nearly means:',
    options: ['A) widely known', 'B) understood by only a small group', 'C) ancient', 'D) controversial'],
    correctIndex: 1,
    explanation: '"Esoteric" knowledge is intended for or understood by only a small, specialised group.',
    difficulty: 2,
    estimatedSeconds: 40
  },

  // =====================================================================
  // GRE — Quant (problem solving)
  // =====================================================================
  {
    category: 'GRE_QUANT',
    prompt: 'What is 35% of 80?',
    options: ['A) 24', 'B) 28', 'C) 30', 'D) 32'],
    correctIndex: 1,
    explanation: '0.35 × 80 = 28.',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'GRE_QUANT',
    prompt: 'If 5x − 3 = 2x + 12, what is x?',
    options: ['A) 3', 'B) 4', 'C) 5', 'D) 6'],
    correctIndex: 2,
    explanation: '5x − 2x = 12 + 3 → 3x = 15 → x = 5.',
    difficulty: 1,
    estimatedSeconds: 45
  },
  {
    category: 'GRE_QUANT',
    prompt: 'A circle has radius 5. What is its area? (Use π ≈ 3.14.)',
    options: ['A) 15.7', 'B) 31.4', 'C) 78.5', 'D) 100'],
    correctIndex: 2,
    explanation: 'Area = πr² = 3.14 × 25 ≈ 78.5.',
    difficulty: 1,
    estimatedSeconds: 45
  },
  {
    category: 'GRE_QUANT',
    prompt: 'If the median of 4, 7, x, 12, 15 is 10, what is x?',
    options: ['A) 8', 'B) 9', 'C) 10', 'D) 11'],
    correctIndex: 2,
    explanation: 'For 5 numbers in order, the median is the 3rd. Sorted: 4, 7, x, 12, 15 with x in the middle position requires x = 10.',
    difficulty: 2,
    estimatedSeconds: 60
  },
  {
    category: 'GRE_QUANT',
    prompt: 'A rectangle has length 12 and width 5. What is its perimeter?',
    options: ['A) 17', 'B) 22', 'C) 34', 'D) 60'],
    correctIndex: 2,
    explanation: 'Perimeter = 2(l + w) = 2(12 + 5) = 34.',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'GRE_QUANT',
    prompt: 'If x is 30% of y and y is 200, what is x?',
    options: ['A) 30', 'B) 50', 'C) 60', 'D) 70'],
    correctIndex: 2,
    explanation: 'x = 0.30 × 200 = 60.',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'GRE_QUANT',
    prompt: 'The sum of three consecutive integers is 36. What is the smallest?',
    options: ['A) 10', 'B) 11', 'C) 12', 'D) 13'],
    correctIndex: 1,
    explanation: 'Let them be n, n+1, n+2. Sum = 3n + 3 = 36 → n = 11.',
    difficulty: 2,
    estimatedSeconds: 55
  },
  {
    category: 'GRE_QUANT',
    prompt: 'If the standard deviation of a data set is 0, which must be true?',
    options: [
      'A) The mean is 0.',
      'B) All values are equal.',
      'C) The data set is empty.',
      'D) The values are all positive.'
    ],
    correctIndex: 1,
    explanation: 'SD = 0 means no spread, so every value equals the mean — all values are identical.',
    difficulty: 2,
    estimatedSeconds: 60
  },
  {
    category: 'GRE_QUANT',
    prompt: 'A bag has 4 red, 6 green, and 10 blue marbles. What is the probability of drawing a green marble?',
    options: ['A) 1/5', 'B) 3/10', 'C) 1/3', 'D) 2/5'],
    correctIndex: 1,
    explanation: 'Total = 20. P(green) = 6/20 = 3/10.',
    difficulty: 1,
    estimatedSeconds: 40
  },
  {
    category: 'GRE_QUANT',
    prompt: 'If f(x) = 2x² − 3x + 1, what is f(2)?',
    options: ['A) 1', 'B) 3', 'C) 5', 'D) 7'],
    correctIndex: 1,
    explanation: 'f(2) = 2(4) − 3(2) + 1 = 8 − 6 + 1 = 3.',
    difficulty: 2,
    estimatedSeconds: 55
  },
  {
    category: 'GRE_QUANT',
    prompt: 'The price of a stock rose 20% then fell 20%. What is the net change from the original price?',
    options: ['A) 0%', 'B) +4%', 'C) −4%', 'D) −20%'],
    correctIndex: 2,
    explanation: '1.20 × 0.80 = 0.96, so a 4% net loss. The two 20%s aren\'t symmetric because they apply to different bases.',
    difficulty: 2,
    estimatedSeconds: 65
  },
  {
    category: 'GRE_QUANT',
    prompt: 'What is the slope of the line through (2, 3) and (5, 12)?',
    options: ['A) 2', 'B) 3', 'C) 4', 'D) 5'],
    correctIndex: 1,
    explanation: 'Slope = (12 − 3) / (5 − 2) = 9/3 = 3.',
    difficulty: 2,
    estimatedSeconds: 55
  },
  {
    category: 'GRE_QUANT',
    prompt: 'How many integers between 1 and 100 inclusive are divisible by both 3 and 5?',
    options: ['A) 4', 'B) 5', 'C) 6', 'D) 7'],
    correctIndex: 2,
    explanation: 'Divisible by both = divisible by LCM(3,5) = 15. Multiples of 15 up to 100: 15, 30, 45, 60, 75, 90 → 6 numbers.',
    difficulty: 2,
    estimatedSeconds: 65
  },
  {
    category: 'GRE_QUANT',
    prompt: 'If the area of a square is 64, what is the length of its diagonal?',
    options: ['A) 8', 'B) 8√2', 'C) 16', 'D) 32'],
    correctIndex: 1,
    explanation: 'Side = 8. Diagonal of a square = side × √2 = 8√2.',
    difficulty: 2,
    estimatedSeconds: 55
  },
  {
    category: 'GRE_QUANT',
    prompt: 'A worker earns GHS 25/hour for the first 40 hours of a week and GHS 37.50/hour for overtime. What is the total pay for a 45-hour week?',
    options: ['A) GHS 1,062.50', 'B) GHS 1,125.00', 'C) GHS 1,187.50', 'D) GHS 1,200.00'],
    correctIndex: 2,
    explanation: 'Regular: 40 × 25 = 1000. Overtime: 5 × 37.50 = 187.50. Total = 1187.50.',
    difficulty: 2,
    estimatedSeconds: 75
  },

  // =====================================================================
  // Ghana Civil Service (general knowledge + arithmetic + English)
  // =====================================================================
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'Who is the current head of state of the Republic of Ghana, as defined by the 1992 Constitution?',
    options: ['A) The Chief Justice', 'B) The Speaker of Parliament', 'C) The President', 'D) The Vice President'],
    correctIndex: 2,
    explanation: 'Article 57 of the 1992 Constitution names the President as the Head of State, Head of Government, and Commander-in-Chief.',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'How many regions does Ghana currently have following the 2019 reorganisation?',
    options: ['A) 10', 'B) 14', 'C) 16', 'D) 18'],
    correctIndex: 2,
    explanation: 'In 2019, six new regions were created from existing ones (e.g. Bono, Ahafo, Bono East), bringing the total from 10 to 16.',
    difficulty: 2,
    estimatedSeconds: 40
  },
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'The Bank of Ghana was established in which year?',
    options: ['A) 1953', 'B) 1957', 'C) 1960', 'D) 1965'],
    correctIndex: 1,
    explanation: 'The Bank of Ghana was established in 1957, the same year Ghana gained independence, by the Bank of Ghana Ordinance.',
    difficulty: 2,
    estimatedSeconds: 40
  },
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'A civil servant earns GHS 4,500 per month. What is their annual gross salary?',
    options: ['A) GHS 45,000', 'B) GHS 54,000', 'C) GHS 60,000', 'D) GHS 72,000'],
    correctIndex: 1,
    explanation: '4,500 × 12 = 54,000.',
    difficulty: 1,
    estimatedSeconds: 40
  },
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'Which institution is responsible for managing public service recruitment and conditions in Ghana?',
    options: [
      'A) Ghana Revenue Authority',
      'B) Public Services Commission',
      'C) Electoral Commission',
      'D) National Development Planning Commission'
    ],
    correctIndex: 1,
    explanation: 'The Public Services Commission, established under Article 194, advises on appointments, promotions, and discipline in the public services.',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'Choose the grammatically correct sentence.',
    options: [
      'A) Each of the applicants have submitted their forms.',
      'B) Each of the applicants has submitted their form.',
      'C) Each of the applicants are submitting their forms.',
      'D) Each of the applicants submit their forms.'
    ],
    correctIndex: 1,
    explanation: '"Each" is singular and takes "has". The intervening "of the applicants" doesn\'t change the verb.',
    difficulty: 2,
    estimatedSeconds: 45
  },
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'A district assembly has 60 members. If 25% are women, how many are men?',
    options: ['A) 15', 'B) 35', 'C) 40', 'D) 45'],
    correctIndex: 3,
    explanation: 'Women = 25% of 60 = 15. Men = 60 − 15 = 45.',
    difficulty: 1,
    estimatedSeconds: 45
  },
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'Which document sets out the fundamental rights and freedoms of Ghanaians?',
    options: [
      'A) The Civil Service Act',
      'B) Chapter 5 of the 1992 Constitution',
      'C) The Public Order Act',
      'D) The Companies Act'
    ],
    correctIndex: 1,
    explanation: 'Chapter 5 (Articles 12-33) of the 1992 Constitution enshrines fundamental human rights and freedoms.',
    difficulty: 2,
    estimatedSeconds: 45
  },
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'What does the acronym "GIPC" stand for?',
    options: [
      'A) Ghana Industrial Promotion Centre',
      'B) Ghana Investment Promotion Centre',
      'C) Ghana International Petroleum Council',
      'D) Ghana Integrated Public Council'
    ],
    correctIndex: 1,
    explanation: 'GIPC = Ghana Investment Promotion Centre, the agency that registers and supports foreign and local investment.',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'A budget of GHS 2,400,000 is split between three departments in a 1:2:3 ratio. How much does the largest share receive?',
    options: ['A) GHS 400,000', 'B) GHS 800,000', 'C) GHS 1,000,000', 'D) GHS 1,200,000'],
    correctIndex: 3,
    explanation: 'Total parts = 1+2+3 = 6. One part = 400,000. Largest = 3 × 400,000 = 1,200,000.',
    difficulty: 2,
    estimatedSeconds: 60
  },
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'Choose the correctly punctuated sentence.',
    options: [
      'A) The minister, who arrived late apologised to the audience.',
      'B) The minister who arrived late, apologised to the audience.',
      'C) The minister, who arrived late, apologised to the audience.',
      'D) The minister; who arrived late; apologised to the audience.'
    ],
    correctIndex: 2,
    explanation: 'A non-restrictive relative clause must be enclosed in commas on both sides.',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'The Auditor-General\'s primary role is to:',
    options: [
      'A) Prosecute corruption cases.',
      'B) Audit the public accounts of Ghana.',
      'C) Approve the national budget.',
      'D) Set tax rates.'
    ],
    correctIndex: 1,
    explanation: 'Article 187 charges the Auditor-General with auditing the accounts of all public offices and reporting to Parliament.',
    difficulty: 2,
    estimatedSeconds: 45
  },
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'If the inflation rate is 15% and a basket of goods cost GHS 200 last year, what does it cost today?',
    options: ['A) GHS 215', 'B) GHS 230', 'C) GHS 250', 'D) GHS 300'],
    correctIndex: 1,
    explanation: '200 × 1.15 = 230.',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'The currency of Ghana, the Cedi, was redenominated in which year?',
    options: ['A) 2005', 'B) 2007', 'C) 2010', 'D) 2015'],
    correctIndex: 1,
    explanation: 'The Cedi was redenominated in July 2007, with 10,000 old cedis becoming 1 new Ghana Cedi.',
    difficulty: 2,
    estimatedSeconds: 40
  },
  {
    category: 'GHANA_CIVIL_SERVICE',
    prompt: 'Which best describes "ex gratia" payments?',
    options: [
      'A) Mandatory pension contributions.',
      'B) Voluntary payments not legally required.',
      'C) Tax refunds.',
      'D) Salary advances.'
    ],
    correctIndex: 1,
    explanation: '"Ex gratia" (Latin: out of grace) refers to a payment made without legal obligation, often as goodwill.',
    difficulty: 3,
    estimatedSeconds: 55
  },

  // =====================================================================
  // Consulting Case (market sizing + profit tree + framework MCQ)
  // =====================================================================
  {
    category: 'CONSULTING_CASE',
    prompt: 'A coffee shop has weekly revenue of GHS 20,000 and weekly costs of GHS 14,000. What is its weekly profit margin?',
    options: ['A) 20%', 'B) 25%', 'C) 30%', 'D) 40%'],
    correctIndex: 2,
    explanation: 'Profit = 20,000 − 14,000 = 6,000. Margin = 6,000 / 20,000 = 30%.',
    difficulty: 1,
    estimatedSeconds: 50
  },
  {
    category: 'CONSULTING_CASE',
    prompt: 'A profit tree decomposes profit into:',
    options: [
      'A) Revenue × Cost',
      'B) Revenue − Cost (then each into sub-components)',
      'C) Volume × Price only',
      'D) Market share × Total market only'
    ],
    correctIndex: 1,
    explanation: 'Profit = Revenue − Cost. Revenue then breaks into Volume × Price; Cost into Fixed + Variable. That\'s the standard tree.',
    difficulty: 1,
    estimatedSeconds: 45
  },
  {
    category: 'CONSULTING_CASE',
    prompt: 'Estimate: Roughly how many barbershops are there in Accra (~5M people)?',
    options: ['A) ~500', 'B) ~5,000', 'C) ~50,000', 'D) ~500,000'],
    correctIndex: 1,
    explanation: 'Assume ~50% male = 2.5M, one haircut/month, one barber serves ~10/day × 25 days = 250 cuts/month. 2.5M / 250 ≈ 10,000 barbers; with ~2 per shop, ~5,000 shops.',
    difficulty: 3,
    estimatedSeconds: 90
  },
  {
    category: 'CONSULTING_CASE',
    prompt: 'A telecom\'s ARPU drops 10% and subscribers grow 5%. What is the approximate revenue change?',
    options: ['A) +5%', 'B) −5%', 'C) −5.5%', 'D) Unchanged'],
    correctIndex: 2,
    explanation: 'Revenue = ARPU × Subs. New = 0.90 × 1.05 = 0.945, a 5.5% decline. Always multiply, don\'t add, percentage changes.',
    difficulty: 2,
    estimatedSeconds: 75
  },
  {
    category: 'CONSULTING_CASE',
    prompt: 'In a market entry case, which framework most directly assesses competitive intensity?',
    options: [
      'A) 4Ps marketing mix',
      'B) Porter\'s Five Forces',
      'C) BCG Matrix',
      'D) Ansoff Matrix'
    ],
    correctIndex: 1,
    explanation: 'Porter\'s Five Forces (rivalry, suppliers, buyers, substitutes, new entrants) is the canonical lens for competitive intensity.',
    difficulty: 1,
    estimatedSeconds: 45
  },
  {
    category: 'CONSULTING_CASE',
    prompt: 'A solar installer has fixed costs of GHS 100,000/month and contribution margin of GHS 500 per system installed. What is the monthly break-even volume?',
    options: ['A) 100', 'B) 150', 'C) 200', 'D) 500'],
    correctIndex: 2,
    explanation: 'Break-even = Fixed costs / Contribution margin = 100,000 / 500 = 200 units.',
    difficulty: 2,
    estimatedSeconds: 60
  },
  {
    category: 'CONSULTING_CASE',
    prompt: 'A client\'s revenue is flat but profit fell 30%. What should you investigate first?',
    options: [
      'A) Marketing spend.',
      'B) Cost structure — both fixed and variable.',
      'C) Brand awareness.',
      'D) Customer satisfaction scores.'
    ],
    correctIndex: 1,
    explanation: 'If revenue is flat and profit fell, costs rose. Investigate cost structure first — that\'s where the leak is.',
    difficulty: 2,
    estimatedSeconds: 55
  },
  {
    category: 'CONSULTING_CASE',
    prompt: 'Estimate: How many smartphones are sold annually in Ghana (~32M people)?',
    options: ['A) ~50,000', 'B) ~500,000', 'C) ~5,000,000', 'D) ~50,000,000'],
    correctIndex: 2,
    explanation: 'Adults ~20M, ~70% own phones = 14M phones, replaced every ~3 years → ~4.7M sold/year. Round to ~5M.',
    difficulty: 3,
    estimatedSeconds: 90
  },
  {
    category: 'CONSULTING_CASE',
    prompt: 'A client wants to grow revenue. The McKinsey "MECE" principle says your options should be:',
    options: [
      'A) Mutually exclusive, collectively exhaustive.',
      'B) Mostly equal, completely effective.',
      'C) Multi-channel, equally costed.',
      'D) Market-led, customer-empowered.'
    ],
    correctIndex: 0,
    explanation: 'MECE = Mutually Exclusive, Collectively Exhaustive: no overlaps, no gaps. Foundational structuring tool.',
    difficulty: 2,
    estimatedSeconds: 45
  },
  {
    category: 'CONSULTING_CASE',
    prompt: 'A retailer sells 10,000 units at GHS 50, with variable cost GHS 30/unit and fixed costs GHS 100,000. What is the operating profit?',
    options: ['A) GHS 50,000', 'B) GHS 100,000', 'C) GHS 150,000', 'D) GHS 200,000'],
    correctIndex: 1,
    explanation: 'Contribution = (50 − 30) × 10,000 = 200,000. Operating profit = 200,000 − 100,000 fixed = 100,000.',
    difficulty: 2,
    estimatedSeconds: 75
  },
  {
    category: 'CONSULTING_CASE',
    prompt: 'In a profitability case, you find one product line has negative contribution margin. What is the most likely first recommendation?',
    options: [
      'A) Increase marketing spend on it.',
      'B) Discontinue or reprice it.',
      'C) Bundle it with profitable products.',
      'D) Outsource its production.'
    ],
    correctIndex: 1,
    explanation: 'Negative contribution margin means each unit sold loses money before fixed costs — repricing or discontinuing comes first.',
    difficulty: 2,
    estimatedSeconds: 55
  },
  {
    category: 'CONSULTING_CASE',
    prompt: 'Estimate: Annual market for bottled water in Ghana, in litres.',
    options: ['A) ~5M', 'B) ~50M', 'C) ~500M', 'D) ~5B'],
    correctIndex: 2,
    explanation: '32M people × ~50% bottled water consumers × ~30 L/year ≈ 480M ≈ 500M litres.',
    difficulty: 3,
    estimatedSeconds: 90
  },
  {
    category: 'CONSULTING_CASE',
    prompt: 'A bank wants to enter mobile money. The "build vs partner" decision is a classic example of:',
    options: [
      'A) Make-or-buy analysis.',
      'B) SWOT analysis.',
      'C) Customer segmentation.',
      'D) Pricing optimisation.'
    ],
    correctIndex: 0,
    explanation: 'Make-or-buy analysis weighs in-house build vs partnering/buying — the right framing for build-vs-partner.',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'CONSULTING_CASE',
    prompt: 'A factory\'s output drops 10% and unit fixed costs rise 11%. The relationship between volume and unit fixed cost is:',
    options: ['A) Direct', 'B) Inverse', 'C) Independent', 'D) Random'],
    correctIndex: 1,
    explanation: 'Fixed costs spread over fewer units raises per-unit cost — an inverse relationship. (1 / 0.9 ≈ 1.11.)',
    difficulty: 2,
    estimatedSeconds: 55
  },
  {
    category: 'CONSULTING_CASE',
    prompt: 'A hotel has 100 rooms at GHS 400/night and 60% occupancy. What is monthly revenue (30 days)?',
    options: ['A) GHS 240,000', 'B) GHS 480,000', 'C) GHS 720,000', 'D) GHS 1,200,000'],
    correctIndex: 2,
    explanation: '100 × 0.60 × 400 = 24,000/night × 30 = 720,000.',
    difficulty: 2,
    estimatedSeconds: 65
  },

  // =====================================================================
  // Numerical (sequences + ratios + percentages)
  // =====================================================================
  {
    category: 'NUMERICAL',
    prompt: 'What number comes next? 2, 4, 8, 16, ?',
    options: ['A) 24', 'B) 30', 'C) 32', 'D) 64'],
    correctIndex: 2,
    explanation: 'Each term doubles. 16 × 2 = 32.',
    difficulty: 1,
    estimatedSeconds: 30
  },
  {
    category: 'NUMERICAL',
    prompt: 'What number comes next? 3, 6, 11, 18, 27, ?',
    options: ['A) 36', 'B) 38', 'C) 40', 'D) 42'],
    correctIndex: 1,
    explanation: 'Differences are 3, 5, 7, 9 (odd numbers). Next difference is 11. 27 + 11 = 38.',
    difficulty: 2,
    estimatedSeconds: 60
  },
  {
    category: 'NUMERICAL',
    prompt: 'A recipe uses sugar and flour in ratio 2:5. If 200g of flour is used, how much sugar?',
    options: ['A) 40g', 'B) 50g', 'C) 80g', 'D) 100g'],
    correctIndex: 2,
    explanation: '5 parts = 200g, so 1 part = 40g. Sugar (2 parts) = 80g.',
    difficulty: 1,
    estimatedSeconds: 50
  },
  {
    category: 'NUMERICAL',
    prompt: 'What is 15% of 240?',
    options: ['A) 24', 'B) 30', 'C) 36', 'D) 40'],
    correctIndex: 2,
    explanation: '10% of 240 = 24, 5% = 12, so 15% = 36.',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'NUMERICAL',
    prompt: 'Find the missing term: 1, 1, 2, 3, 5, 8, ?, 21',
    options: ['A) 11', 'B) 12', 'C) 13', 'D) 14'],
    correctIndex: 2,
    explanation: 'Fibonacci: each term is the sum of the previous two. 5 + 8 = 13.',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'NUMERICAL',
    prompt: 'A shirt sells for GHS 90 after a 25% discount. What was the original price?',
    options: ['A) GHS 100', 'B) GHS 112.50', 'C) GHS 115', 'D) GHS 120'],
    correctIndex: 3,
    explanation: '90 = 0.75 × original. Original = 90 / 0.75 = 120.',
    difficulty: 2,
    estimatedSeconds: 55
  },
  {
    category: 'NUMERICAL',
    prompt: 'What number comes next? 100, 81, 64, 49, ?',
    options: ['A) 25', 'B) 32', 'C) 36', 'D) 40'],
    correctIndex: 2,
    explanation: 'These are 10², 9², 8², 7². Next is 6² = 36.',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'NUMERICAL',
    prompt: 'If 8 workers complete a job in 12 days, how long will 6 workers take (same productivity)?',
    options: ['A) 9 days', 'B) 14 days', 'C) 16 days', 'D) 18 days'],
    correctIndex: 2,
    explanation: 'Work = 8 × 12 = 96 worker-days. With 6 workers: 96 / 6 = 16 days.',
    difficulty: 2,
    estimatedSeconds: 60
  },
  {
    category: 'NUMERICAL',
    prompt: 'A score increased from 60 to 75. What was the percentage increase?',
    options: ['A) 15%', 'B) 20%', 'C) 25%', 'D) 30%'],
    correctIndex: 2,
    explanation: 'Increase = 15. Percentage = 15 / 60 = 0.25 = 25%. Always divide by the *original* value.',
    difficulty: 1,
    estimatedSeconds: 45
  },
  {
    category: 'NUMERICAL',
    prompt: 'What number comes next? 7, 14, 28, 56, ?',
    options: ['A) 84', 'B) 98', 'C) 112', 'D) 126'],
    correctIndex: 2,
    explanation: 'Each term doubles. 56 × 2 = 112.',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'NUMERICAL',
    prompt: 'A car covers 240 km in 3 hours. What is its average speed in km/h?',
    options: ['A) 60', 'B) 70', 'C) 80', 'D) 90'],
    correctIndex: 2,
    explanation: 'Speed = distance / time = 240 / 3 = 80 km/h.',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'NUMERICAL',
    prompt: 'In a mixture of 5 litres, alcohol to water is 2:3. How much water is there?',
    options: ['A) 1.5 L', 'B) 2 L', 'C) 2.5 L', 'D) 3 L'],
    correctIndex: 3,
    explanation: 'Total parts = 5. Water = 3 parts = (3/5) × 5 L = 3 L.',
    difficulty: 1,
    estimatedSeconds: 45
  },
  {
    category: 'NUMERICAL',
    prompt: 'What number comes next? 1, 4, 9, 16, 25, ?',
    options: ['A) 30', 'B) 32', 'C) 35', 'D) 36'],
    correctIndex: 3,
    explanation: 'Squares: 1², 2², 3², 4², 5². Next is 6² = 36.',
    difficulty: 1,
    estimatedSeconds: 30
  },
  {
    category: 'NUMERICAL',
    prompt: 'A population of 5,000 grows 8% per year. What is the population after one year?',
    options: ['A) 5,080', 'B) 5,400', 'C) 5,500', 'D) 5,800'],
    correctIndex: 1,
    explanation: '5,000 × 1.08 = 5,400.',
    difficulty: 1,
    estimatedSeconds: 40
  },
  {
    category: 'NUMERICAL',
    prompt: 'Find the missing term: 2, 6, 12, 20, 30, ?',
    options: ['A) 36', 'B) 40', 'C) 42', 'D) 48'],
    correctIndex: 2,
    explanation: 'Differences are 4, 6, 8, 10 (even numbers). Next difference 12. 30 + 12 = 42.',
    difficulty: 2,
    estimatedSeconds: 60
  },

  // =====================================================================
  // Logical (syllogisms + relationships)
  // =====================================================================
  {
    category: 'LOGICAL',
    prompt: 'All accountants are precise. John is an accountant. Therefore:',
    options: ['A) John is precise.', 'B) John is not precise.', 'C) John might be precise.', 'D) Cannot be determined.'],
    correctIndex: 0,
    explanation: 'Classic Barbara syllogism. If all A are B and John is A, then John is B.',
    difficulty: 1,
    estimatedSeconds: 40
  },
  {
    category: 'LOGICAL',
    prompt: 'No fish are mammals. All whales are mammals. Therefore:',
    options: ['A) Some whales are fish.', 'B) No whales are fish.', 'C) Some fish are whales.', 'D) Cannot be determined.'],
    correctIndex: 1,
    explanation: 'If whales are mammals and no fish are mammals, then no whales are fish.',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'LOGICAL',
    prompt: 'If it rains, the road is wet. The road is wet. Therefore:',
    options: [
      'A) It rained.',
      'B) It did not rain.',
      'C) Cannot be determined — the road may be wet for other reasons.',
      'D) The rain stopped.'
    ],
    correctIndex: 2,
    explanation: 'Affirming the consequent is a logical fallacy. The road being wet doesn\'t prove rain — it could be a sprinkler, flood, etc.',
    difficulty: 2,
    estimatedSeconds: 55
  },
  {
    category: 'LOGICAL',
    prompt: 'Five friends sit in a row. Ama is to the right of Kojo. Esi is to the left of Kojo. Where does Kojo sit relative to Ama and Esi?',
    options: ['A) On the far left', 'B) Between Ama and Esi', 'C) On the far right', 'D) Cannot determine'],
    correctIndex: 1,
    explanation: 'Esi is to Kojo\'s left, Ama to Kojo\'s right — Kojo sits between them.',
    difficulty: 2,
    estimatedSeconds: 60
  },
  {
    category: 'LOGICAL',
    prompt: 'All roses are flowers. Some flowers fade quickly. Therefore:',
    options: [
      'A) All roses fade quickly.',
      'B) Some roses fade quickly.',
      'C) No roses fade quickly.',
      'D) Cannot be determined.'
    ],
    correctIndex: 3,
    explanation: '"Some flowers fade" doesn\'t tell you whether the fading flowers include roses. Cannot determine.',
    difficulty: 3,
    estimatedSeconds: 65
  },
  {
    category: 'LOGICAL',
    prompt: 'If A > B and B > C, then:',
    options: ['A) A < C', 'B) A > C', 'C) A = C', 'D) Cannot determine'],
    correctIndex: 1,
    explanation: 'Transitivity of inequality: if A > B and B > C, then A > C.',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'LOGICAL',
    prompt: 'No politician is honest. All ministers are politicians. Therefore:',
    options: [
      'A) No minister is honest.',
      'B) All ministers are honest.',
      'C) Some ministers are honest.',
      'D) Cannot be determined.'
    ],
    correctIndex: 0,
    explanation: 'If ministers are politicians and no politicians are honest, then no ministers are honest.',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'LOGICAL',
    prompt: 'Kofi is older than Akua. Akua is older than Yaw. Who is youngest?',
    options: ['A) Kofi', 'B) Akua', 'C) Yaw', 'D) Cannot determine'],
    correctIndex: 2,
    explanation: 'Kofi > Akua > Yaw in age, so Yaw is youngest.',
    difficulty: 1,
    estimatedSeconds: 35
  },
  {
    category: 'LOGICAL',
    prompt: 'If today is Wednesday, what day will it be 100 days from today?',
    options: ['A) Monday', 'B) Tuesday', 'C) Friday', 'D) Saturday'],
    correctIndex: 2,
    explanation: '100 ÷ 7 = 14 remainder 2. Two days after Wednesday is Friday.',
    difficulty: 2,
    estimatedSeconds: 55
  },
  {
    category: 'LOGICAL',
    prompt: 'Some students are athletes. All athletes are disciplined. Therefore:',
    options: [
      'A) All students are disciplined.',
      'B) Some students are disciplined.',
      'C) No students are disciplined.',
      'D) Cannot be determined.'
    ],
    correctIndex: 1,
    explanation: 'The students who *are* athletes are disciplined (since all athletes are). So at least some students are disciplined.',
    difficulty: 2,
    estimatedSeconds: 60
  },
  {
    category: 'LOGICAL',
    prompt: 'In a row of 7 people, Ama is 3rd from the left and Kofi is 3rd from the right. How many people are between them?',
    options: ['A) 0', 'B) 1', 'C) 2', 'D) 3'],
    correctIndex: 1,
    explanation: 'In a row of 7, 3rd from left is position 3 and 3rd from right is position 5. Only position 4 sits between them — 1 person.',
    difficulty: 2,
    estimatedSeconds: 70
  },
  {
    category: 'LOGICAL',
    prompt: 'All squares are rectangles. All rectangles are quadrilaterals. Therefore:',
    options: [
      'A) All squares are quadrilaterals.',
      'B) Some squares are not quadrilaterals.',
      'C) All quadrilaterals are squares.',
      'D) Cannot be determined.'
    ],
    correctIndex: 0,
    explanation: 'Transitivity of class membership: squares ⊆ rectangles ⊆ quadrilaterals, so squares ⊆ quadrilaterals.',
    difficulty: 1,
    estimatedSeconds: 45
  },
  {
    category: 'LOGICAL',
    prompt: 'If "all bloops are razzies" and "all razzies are lazzies", what must be true?',
    options: [
      'A) All lazzies are bloops.',
      'B) All bloops are lazzies.',
      'C) Some lazzies are not razzies.',
      'D) No bloops are lazzies.'
    ],
    correctIndex: 1,
    explanation: 'Bloops ⊆ Razzies ⊆ Lazzies, so all bloops are lazzies. The reverse direction is not implied.',
    difficulty: 2,
    estimatedSeconds: 50
  },
  {
    category: 'LOGICAL',
    prompt: 'A clock shows 3:15. What is the angle between the hour and minute hands?',
    options: ['A) 0°', 'B) 7.5°', 'C) 15°', 'D) 22.5°'],
    correctIndex: 1,
    explanation: 'At 3:15, minute is at 90°. Hour has moved 15/60 of the way from 3 to 4 = 7.5°. Hour is at 90° + 7.5° = 97.5°. Difference = 7.5°.',
    difficulty: 3,
    estimatedSeconds: 90
  },
  {
    category: 'LOGICAL',
    prompt: 'If P implies Q, and Q is false, what can we conclude about P?',
    options: ['A) P is true.', 'B) P is false.', 'C) P is undetermined.', 'D) P implies not-Q.'],
    correctIndex: 1,
    explanation: 'Modus tollens: if P → Q and Q is false, then P must be false (otherwise Q would have had to be true).',
    difficulty: 2,
    estimatedSeconds: 55
  }
];

export async function seedAptitudeQuestions() {
  let created = 0;
  let updated = 0;

  for (const q of QUESTIONS) {
    // Idempotent: look up by exact prompt text and update or create.
    const existing = await prisma.aptitudeQuestion.findFirst({
      where: { prompt: q.prompt },
      select: { id: true }
    });

    if (existing) {
      await prisma.aptitudeQuestion.update({
        where: { id: existing.id },
        data: {
          category: q.category,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          difficulty: q.difficulty ?? 2,
          estimatedSeconds: q.estimatedSeconds ?? 60
        }
      });
      updated += 1;
    } else {
      await prisma.aptitudeQuestion.create({
        data: {
          category: q.category,
          prompt: q.prompt,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          difficulty: q.difficulty ?? 2,
          estimatedSeconds: q.estimatedSeconds ?? 60
        }
      });
      created += 1;
    }
  }

  // Per-category counts so the admin sees what landed where.
  const counts = await prisma.aptitudeQuestion.groupBy({
    by: ['category'],
    _count: { _all: true }
  });

  return {
    created,
    updated,
    total: QUESTIONS.length,
    perCategory: counts.map((c) => ({ category: c.category, count: c._count._all }))
  };
}
