export type LandingContent = {
  hero: {
    eyebrow: string;
    headlineLine1: string;
    headlineLine2: string;
    headlineHighlight: string;
    headlineLine3: string;
    headlineLine4: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    floatingBadgeTitle: string;
    floatingBadgeSubtitle: string;
    photos: string[];
  };
  featuredAlumni: {
    name: string;
    role: string;
    company: string;
    programme: string;
    quote: string;
    photo: string;
  }[];
  story: {
    eyebrow: string;
    headlineLine1: string;
    headlineLine2: string;
    headlineLine3: string;
    paragraphs: string[];
    highlightStat: string;
    highlightLabel: string;
    facts: { number: string; label: string }[];
    photo: string;
  };
  cta: {
    headlineLine1: string;
    headlineLine2: string;
    subtitle: string;
    primary: string;
    secondary: string;
  };
};
