export type Deadline = "1d" | "2d" | "4d" | "ind";
export type PrintVariant = "A" | "B";

export const pricing = {
  formatting: {
    express1DayPerFinalPage: 50,
    express2DaysPerFinalPage: 45,
    express4DaysPerFinalPage: 40,
  },
  proofreading: {
    perNormPage: 75,
  },
  citations: {
    fixedOrApprox: 2800,
  },
  plagiarismCheck: 390,
  aiCheck: 550,
  abstractTranslation: 590,
  presentation: 2700,
  feedback: 1900,
  printBinding: {
    variantA: { oneCopy: 1050, twoToThreeCopies: 950 },
    variantB: { oneCopy: 1150, twoToThreeCopies: 1050 },
  },
} as const;

export function formattingRate(d: Deadline): number | null {
  switch (d) {
    case "1d":
      return pricing.formatting.express1DayPerFinalPage;
    case "2d":
      return pricing.formatting.express2DaysPerFinalPage;
    case "4d":
      return pricing.formatting.express4DaysPerFinalPage;
    case "ind":
      return null;
  }
}

export function printPerCopy(variant: PrintVariant, copies: number): number {
  const v =
    variant === "A" ? pricing.printBinding.variantA : pricing.printBinding.variantB;
  return copies <= 1 ? v.oneCopy : v.twoToThreeCopies;
}
