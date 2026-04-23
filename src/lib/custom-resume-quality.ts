import { ResumeData } from "@/types";

export function hasMeaningfulEducation(entries: ResumeData["education"]) {
  return entries.some((entry) =>
    [entry.school, entry.degree, entry.major, entry.startDate, entry.endDate, entry.gpa ?? ""].filter((value) => value?.trim()).length >= 2,
  );
}

export function hasMeaningfulInternships(entries: ResumeData["internships"]) {
  return entries.some((entry) => {
    const base = [entry.company, entry.position, entry.startDate, entry.endDate].filter((value) => value?.trim()).length;
    const descriptions = (entry.descriptions ?? []).filter((item) => item.trim()).length;
    return base >= 2 || descriptions >= 2;
  });
}

export function hasMeaningfulCampus(entries: ResumeData["campusExperience"]) {
  return entries.some((entry) => {
    const base = [entry.organization, entry.role, entry.startDate, entry.endDate].filter((value) => value?.trim()).length;
    const descriptions = (entry.descriptions ?? []).filter((item) => item.trim()).length;
    return base >= 2 || descriptions >= 2;
  });
}

export function hasMeaningfulProjects(entries: ResumeData["projects"] | undefined) {
  return (entries ?? []).some((entry) => {
    const base = [entry.name, entry.role].filter((value) => value?.trim()).length;
    const descriptions = (entry.descriptions ?? []).filter((item) => item.trim()).length;
    const techStack = (entry.techStack ?? []).filter((item) => item.trim()).length;
    return base >= 1 && (descriptions >= 2 || techStack >= 1);
  });
}

export function isMeaningfulProfile(profile: ResumeData["profile"]) {
  const values = [profile.name, profile.phone, profile.email, profile.wechat ?? "", profile.targetRole ?? ""];
  return values.filter((value) => value?.trim()).length >= 2;
}

export function getSparseResumeWarnings(data: ResumeData) {
  const warnings: string[] = [];

  if (!isMeaningfulProfile(data.profile)) warnings.push("基础信息");
  if (!hasMeaningfulEducation(data.education ?? [])) warnings.push("教育经历");
  if (!hasMeaningfulInternships(data.internships ?? [])) warnings.push("实习经历");
  if (!hasMeaningfulCampus(data.campusExperience ?? [])) warnings.push("校园经历");
  if (!hasMeaningfulProjects(data.projects ?? [])) warnings.push("项目经历");

  const hasSkills =
    (data.skills.professional?.length ?? 0) > 0 ||
    (data.skills.languages?.length ?? 0) > 0 ||
    (data.skills.certificates?.length ?? 0) > 0 ||
    (data.skills.tools?.length ?? 0) > 0;
  if (!hasSkills) warnings.push("技能");

  return warnings;
}
