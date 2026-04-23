import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { ResumeData } from "@/types";

const FONT_FAMILY = "NotoSansSC";

Font.register({
  family: FONT_FAMILY,
  src: "/fonts/NotoSansCJKsc-Regular.otf",
});

// Disable default hyphenation so ordinary English words don't wrap with inserted hyphens.
Font.registerHyphenationCallback((word) => [word]);

type ResumePeriod = {
  text: string;
  isAscii: boolean;
};

type ResumeEntry = {
  title: string;
  subtitle?: string;
  period?: ResumePeriod;
  bullets: string[];
  tags?: string[];
};

type ResumeContactItem = {
  text: string;
};

export type ResumePdfModel = {
  name: string;
  contactItems: ResumeContactItem[];
  targetRole?: string;
  education: ResumeEntry[];
  internships: ResumeEntry[];
  campus: ResumeEntry[];
  projects: ResumeEntry[];
  skillRows: Array<{ label: string; value: string }>;
};

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

function normalizeForPeriod(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "");
}

function joinNonEmpty(parts: Array<string | undefined>, sep: string) {
  return parts.map((part) => clean(part)).filter(Boolean).join(sep);
}

function stabilizeMixedScriptText(text: string) {
  if (!text) return text;
  const joiner = "\u2060";
  return text
    .replace(/([A-Za-z0-9%+_./@#&-])([\u4E00-\u9FFF])/g, `$1${joiner}$2`)
    .replace(/([\u4E00-\u9FFF])([A-Za-z0-9%+_./@#&-])/g, `$1${joiner}$2`);
}

function buildContactItems(data: ResumeData): ResumeContactItem[] {
  return [data.profile.phone, data.profile.email, data.profile.wechat]
    .map((item) => clean(item))
    .filter(Boolean)
    .map((text) => ({
      text: breakLongTokens(stabilizeMixedScriptText(text)),
    }));
}

function breakLongTokens(text: string, chunkSize = 18): string {
  if (!text) return text;
  const zeroWidthBreak = "\u200b";
  const tokenPattern = /(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]{24,}|[A-Za-z0-9_./:@#%?=&+-]{40,})/g;
  return text.replace(tokenPattern, (token) => {
    const pieces: string[] = [];
    for (let index = 0; index < token.length; index += chunkSize) {
      pieces.push(token.slice(index, index + chunkSize));
    }
    return pieces.join(zeroWidthBreak);
  });
}

function normalizedBullets(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => breakLongTokens(stabilizeMixedScriptText(clean(value))))
    .filter(Boolean);
}

function normalizePeriodPart(value: string | undefined, fallback: "start" | "end") {
  const raw = clean(value);
  if (!raw) return undefined;

  const normalized = normalizeForPeriod(raw);
  if (!normalized) return undefined;

  if (/^(至今|现在|目前|present|current)$/i.test(normalized)) return "Present";
  if (/^(在读|预计毕业|预期毕业|expected)$/i.test(normalized)) return fallback === "end" ? "Expected" : undefined;

  const yearMonthMatch = normalized.match(/(19|20)\d{2}[./-年](\d{1,2})/);
  if (yearMonthMatch) {
    const year = yearMonthMatch[0].match(/(19|20)\d{2}/)?.[0] ?? "";
    const month = yearMonthMatch[2].padStart(2, "0");
    return `${year}.${month}`;
  }

  const yearOnlyMatch = normalized.match(/((19|20)\d{2})年?$/);
  if (yearOnlyMatch) {
    return yearOnlyMatch[1];
  }

  return normalized
    .replace(/年/g, ".")
    .replace(/月/g, "")
    .replace(/日/g, "")
    .replace(/[—–~～至]+/g, "-");
}

function isAsciiPeriod(text: string) {
  return /^[\x00-\x7F]+$/.test(text);
}

function formatPeriod(startDate?: string, endDate?: string): ResumePeriod | undefined {
  const start = normalizePeriodPart(startDate, "start");
  const end = normalizePeriodPart(endDate, "end");
  if (!start && !end) return undefined;

  const text = [start, end].filter(Boolean).join(" - ");
  return {
    text,
    isAscii: isAsciiPeriod(text),
  };
}

function hasMeaningfulEntry(entry: ResumeEntry) {
  return Boolean(
    clean(entry.title) ||
      clean(entry.subtitle) ||
      clean(entry.period?.text) ||
      entry.bullets.length > 0 ||
      (entry.tags?.length ?? 0) > 0,
  );
}

function compactBullets(values: string[] | undefined, limit = 4) {
  return normalizedBullets(values)
    .map((value) => value.replace(/^[•·▪◦-]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function buildResumePdfModel(data: ResumeData): ResumePdfModel {
  const education = data.education
    .map<ResumeEntry>((item) => ({
      title: clean(item.school),
      subtitle: stabilizeMixedScriptText(joinNonEmpty([item.degree, item.major], " · ")),
      period: formatPeriod(item.startDate, item.endDate),
      bullets: item.gpa ? [`GPA ${clean(item.gpa)}`] : [],
    }))
    .filter(hasMeaningfulEntry);

  const internships = data.internships
    .map<ResumeEntry>((item) => ({
      title: clean(item.company),
      subtitle: stabilizeMixedScriptText(clean(item.position)) || undefined,
      period: formatPeriod(item.startDate, item.endDate),
      bullets: compactBullets(item.descriptions),
    }))
    .filter(hasMeaningfulEntry);

  const campus = data.campusExperience
    .map<ResumeEntry>((item) => ({
      title: clean(item.organization),
      subtitle: stabilizeMixedScriptText(clean(item.role)) || undefined,
      period: formatPeriod(item.startDate, item.endDate),
      bullets: compactBullets(item.descriptions),
    }))
    .filter(hasMeaningfulEntry);

  const projects = (data.projects ?? [])
    .map<ResumeEntry>((item) => ({
      title: clean(item.name),
      subtitle: stabilizeMixedScriptText(clean(item.role)) || undefined,
      period: undefined,
      tags: normalizedBullets(item.techStack).slice(0, 5),
      bullets: compactBullets(item.descriptions),
    }))
    .filter(hasMeaningfulEntry);

  const skillRows: Array<{ label: string; value: string }> = [];
  if (data.skills.professional.length > 0) {
    skillRows.push({ label: "专业技能", value: stabilizeMixedScriptText(data.skills.professional.join("、")) });
  }
  if ((data.skills.languages ?? []).length > 0) {
    skillRows.push({ label: "语言能力", value: stabilizeMixedScriptText((data.skills.languages ?? []).join("、")) });
  }
  if ((data.skills.certificates ?? []).length > 0) {
    skillRows.push({ label: "证书资质", value: stabilizeMixedScriptText((data.skills.certificates ?? []).join("、")) });
  }
  if ((data.skills.tools ?? []).length > 0) {
    skillRows.push({ label: "工具平台", value: stabilizeMixedScriptText((data.skills.tools ?? []).join("、")) });
  }

  return {
    name: clean(data.profile.name) || "匿名候选人",
    contactItems: buildContactItems(data),
    targetRole: stabilizeMixedScriptText(clean(data.profile.targetRole)),
    education,
    internships,
    campus,
    projects,
    skillRows,
  };
}

const theme = {
  title: "#121417",
  body: "#23272f",
  secondary: "#5b6270",
  muted: "#7d8594",
  subtle: "#a3abb8",
  rule: "#d9dde6",
  border: "#cdd3de",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 18,
    paddingHorizontal: 28,
    paddingBottom: 18,
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    lineHeight: 1.3,
    color: theme.body,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    paddingBottom: 8,
    marginBottom: 5,
  },
  name: {
    fontSize: 25,
    color: theme.title,
    lineHeight: 1.04,
    letterSpacing: 0.2,
  },
  metaRow: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  contact: {
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 6,
    rowGap: 2,
  },
  contactItem: {
    fontSize: 9,
    color: theme.secondary,
    lineHeight: 1.2,
    fontFamily: FONT_FAMILY,
    maxWidth: "100%",
  },
  contactSeparator: {
    fontSize: 8.5,
    color: theme.subtle,
    lineHeight: 1.1,
  },
  targetRole: {
    fontSize: 8.6,
    fontFamily: FONT_FAMILY,
    color: theme.muted,
    lineHeight: 1.2,
    textAlign: "right",
    maxWidth: 128,
    flexShrink: 1,
  },
  section: {
    marginTop: 5,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 10.1,
    color: theme.title,
    lineHeight: 1.12,
    letterSpacing: 0.4,
  },
  sectionRule: {
    flexGrow: 1,
    height: 1,
    backgroundColor: theme.rule,
    marginLeft: 8,
  },
  entry: {
    marginBottom: 4,
  },
  entryHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  entryMain: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    paddingRight: 6,
  },
  entryTitle: {
    fontSize: 9.8,
    color: theme.title,
    lineHeight: 1.2,
    maxWidth: "100%",
  },
  entrySubtitle: {
    fontSize: 8.9,
    color: theme.secondary,
    lineHeight: 1.18,
    marginTop: 1,
    maxWidth: "100%",
  },
  entryPeriod: {
    width: 78,
    fontFamily: FONT_FAMILY,
    fontSize: 8.5,
    textAlign: "right",
    color: theme.muted,
    lineHeight: 1.1,
    flexShrink: 0,
    marginLeft: 6,
  },
  tags: {
    fontSize: 8.2,
    color: theme.muted,
    lineHeight: 1.15,
    marginTop: 1.5,
    maxWidth: "100%",
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 0.5,
    width: "100%",
  },
  bulletMark: {
    width: 6,
    fontSize: 7.4,
    color: theme.subtle,
    lineHeight: 1.22,
    marginTop: 0.6,
  },
  bulletText: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    fontSize: 8.75,
    color: theme.body,
    lineHeight: 1.18,
    maxWidth: "100%",
  },
  skillRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 1.5,
  },
  skillLabel: {
    width: 50,
    fontSize: 8.7,
    color: theme.title,
    lineHeight: 1.16,
    flexShrink: 0,
  },
  skillValue: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    fontSize: 8.7,
    color: theme.body,
    lineHeight: 1.22,
    maxWidth: "100%",
  },
});

function Section({ title, entries }: { title: string; entries: ResumeEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <View style={styles.section} wrap>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionRule} />
      </View>

      {entries.map((entry, index) => (
        <View key={`${title}-${index}`} style={styles.entry} wrap>
          <View style={styles.entryHead}>
            <View style={styles.entryMain}>
              <Text style={styles.entryTitle} wrap>
                {breakLongTokens(stabilizeMixedScriptText(entry.title))}
              </Text>
              {entry.subtitle ? (
                <Text style={styles.entrySubtitle} wrap>
                  {breakLongTokens(stabilizeMixedScriptText(entry.subtitle))}
                </Text>
              ) : null}
            </View>
            {entry.period ? (
              <Text style={styles.entryPeriod}>
                {entry.period.text}
              </Text>
            ) : null}
          </View>

          {(entry.tags ?? []).length > 0 ? (
            <Text style={styles.tags} wrap>
              {`技术栈 · ${(entry.tags ?? []).map((tag) => breakLongTokens(stabilizeMixedScriptText(tag))).join(" / ")}`}
            </Text>
          ) : null}

          {entry.bullets.map((bullet, bulletIndex) => (
            <View key={`${title}-${index}-${bulletIndex}`} style={styles.bulletRow} wrap>
              <Text style={styles.bulletMark}>•</Text>
              <Text style={styles.bulletText} wrap>
                {breakLongTokens(stabilizeMixedScriptText(bullet))}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function SkillsSection({ rows }: { rows: ResumePdfModel["skillRows"] }) {
  if (rows.length === 0) return null;

  return (
    <View style={styles.section} wrap>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>技能</Text>
        <View style={styles.sectionRule} />
      </View>

      {rows.map((row, index) => (
        <View key={`skill-${index}`} style={styles.skillRow} wrap>
          <Text style={styles.skillLabel}>{row.label}</Text>
          <Text style={styles.skillValue}>{breakLongTokens(stabilizeMixedScriptText(row.value))}</Text>
        </View>
      ))}
    </View>
  );
}

function ResumeDoc({ model }: { model: ResumePdfModel }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.name}>{model.name}</Text>
          <View style={styles.metaRow}>
            <View style={styles.contact}>
              {model.contactItems.map((item, index) => (
                <View key={`contact-${index}`} style={{ flexDirection: "row", alignItems: "center", maxWidth: "100%" }} wrap>
                  {index > 0 ? <Text style={styles.contactSeparator}>|</Text> : null}
                  <Text style={styles.contactItem}>
                    {item.text}
                  </Text>
                </View>
              ))}
            </View>
            {model.targetRole ? <Text style={styles.targetRole}>{breakLongTokens(stabilizeMixedScriptText(model.targetRole))}</Text> : null}
          </View>
        </View>

        <Section title="教育经历" entries={model.education} />
        <Section title="实习经历" entries={model.internships} />
        <Section title="项目经历" entries={model.projects} />
        <SkillsSection rows={model.skillRows} />
        <Section title="校园经历" entries={model.campus} />
      </Page>
    </Document>
  );
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

function resolveDownloadName(fileName?: string) {
  const fallback = `主简历-${new Date().toISOString().slice(0, 10)}.pdf`;
  const candidate = sanitizeFileName(fileName ?? "");
  if (!candidate) return fallback;
  return candidate.toLowerCase().endsWith(".pdf") ? candidate : `${candidate}.pdf`;
}

export async function exportResumePdf(data: ResumeData, options?: { fileName?: string }) {
  const model = buildResumePdfModel(data);
  const blob = await pdf(<ResumeDoc model={model} />).toBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = resolveDownloadName(options?.fileName);
  anchor.click();
  URL.revokeObjectURL(url);
}
