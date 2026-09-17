import { describe, expect, it } from "vitest";
import type { ProgramSummary } from "./queries";
import { activityFrom, ageOn, birthDateProblem, recommendTemplate } from "./onboarding";

describe("activityFrom", () => {
  it("antrenman günlerini formülün kendi aralıklarına oturtur", () => {
    expect(activityFrom(0, "seated")).toBe("sedentary");
    expect(activityFrom(3, "seated")).toBe("light");
    expect(activityFrom(4, "seated")).toBe("moderate");
    expect(activityFrom(6, "seated")).toBe("active");
  });

  it("gün içi hareket basamak ekler", () => {
    // Masa başı + haftada 4 gün ile garson + haftada 4 gün aynı kişi değil.
    expect(activityFrom(4, "on_feet")).toBe("active");
    expect(activityFrom(3, "physical")).toBe("active");
  });

  it("en üst basamakta durur", () => {
    expect(activityFrom(7, "physical")).toBe("very_active");
  });

  it("gün bilinmiyorsa antrenman varsaymaz", () => {
    // Bilinmeyen antrenmanı saymak kalori hedefini şişirirdi.
    expect(activityFrom(null, "seated")).toBe("sedentary");
    expect(activityFrom(null, "on_feet")).toBe("light");
  });
});

const template = (
  name: string,
  goal: string,
  level: string,
  days_per_week: number,
): ProgramSummary => ({
  id: name,
  name,
  description: null,
  goal,
  level,
  days_per_week,
  is_template: true,
  is_active: false,
  source_name: null,
  source_url: null,
});

// Tohum verisindeki şablonların kısaltılmış hâli.
const TEMPLATES = [
  template("PPL", "hypertrophy", "intermediate", 3),
  template("Üst/Alt", "hypertrophy", "intermediate", 4),
  template("PHUL", "powerbuilding", "intermediate", 4),
  template("PHAT", "powerbuilding", "advanced", 5),
  template("StrongLifts", "strength", "beginner", 2),
  template("Nuckols 3x", "strength", "beginner", 3),
  template("GZCLP", "strength", "intermediate", 4),
];

describe("recommendTemplate", () => {
  it("yeni başlayana ileri seviye program önermez", () => {
    const result = recommendTemplate(TEMPLATES, {
      goal: "powerbuilding",
      experience: "new",
      days: 5,
    });
    expect(result?.template.level).toBe("beginner");
  });

  it("hedefe uygun şablon seviyede yoksa bunu açıkça söyler", () => {
    // Hipertrofi şablonlarının hepsi orta seviye.
    const result = recommendTemplate(TEMPLATES, {
      goal: "hypertrophy",
      experience: "under_1y",
      days: 3,
    });
    expect(result?.template.goal).toBe("strength");
    expect(result?.note).toMatch(/seviyen/);
  });

  it("ayrılabilen günü aşmayanı seçer", () => {
    const result = recommendTemplate(TEMPLATES, {
      goal: "hypertrophy",
      experience: "one_to_three",
      days: 3,
    });
    expect(result?.template.name).toBe("PPL");
    expect(result?.note).toBeNull();
  });

  it("güne en yakın olanı seçer", () => {
    const result = recommendTemplate(TEMPLATES, {
      goal: "strength",
      experience: "new",
      days: 3,
    });
    expect(result?.template.name).toBe("Nuckols 3x");
  });

  it("deneyimli kişide orta seviyeyi ileriden önce tutar", () => {
    const result = recommendTemplate(TEMPLATES, {
      goal: "powerbuilding",
      experience: "over_three",
      days: 5,
    });
    expect(result?.template.name).toBe("PHUL");
  });

  it("hedefe hiç şablon yoksa seviyeyi suçlamaz", () => {
    const result = recommendTemplate(TEMPLATES, {
      goal: "general_fitness",
      experience: "new",
      days: 3,
    });
    expect(result?.template.name).toBe("Nuckols 3x");
    expect(result?.note).toMatch(/henüz yok/);
  });

  it("hiç uygun şablon yoksa null döner", () => {
    expect(
      recommendTemplate([template("PHAT", "powerbuilding", "advanced", 5)], {
        goal: null,
        experience: "new",
        days: null,
      }),
    ).toBeNull();
  });

  it("günden fazla bir şablon kaldıysa bunu söyler", () => {
    const result = recommendTemplate(TEMPLATES, {
      goal: "strength",
      experience: "one_to_three",
      days: 1,
    });
    expect(result?.template.days_per_week).toBe(2);
    expect(result?.note).toMatch(/1 günlük/);
  });
});

describe("doğum tarihi", () => {
  const today = new Date(2026, 8, 16);

  it("doğum günü gelmediyse bir yaş eksik sayar", () => {
    expect(ageOn("1995-09-17", today)).toBe(30);
    expect(ageOn("1995-09-16", today)).toBe(31);
  });

  it("yazım hatası gibi duran yılları yakalar", () => {
    expect(birthDateProblem("2025-01-01", today)).not.toBeNull();
    expect(birthDateProblem("1900-01-01", today)).not.toBeNull();
    expect(birthDateProblem("1995-04-12", today)).toBeNull();
  });

  it("boş bırakmak hata değil", () => {
    expect(birthDateProblem("", today)).toBeNull();
  });
});
