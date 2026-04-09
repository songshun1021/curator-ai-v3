import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { ResumeData } from "@/types";

const FONT_FAMILY = "NotoSansSC";

Font.register({
  family: FONT_FAMILY,
  src: "/fonts/NotoSansCJKsc-Regular.otf",
});

type ResumeEntry = {
  title: string;
  subtitle?: string;
  period?: string;
  bullets: string[];
  tags?: string[];
};

export type ResumePdfModel = {
  name: string;
  contactLine: string;
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

function joinNonEmpty(parts: Array<string | undefined>, sep: string) {
  return parts.map((p) => clean(p)).filter(Boolean).join(sep);
}

function normalizedBullets(values: string[] | undefined): string[] {
  return (values ?? []).map((v) => breakLongTokens(clean(v))).filter(Boolean);
}

function breakLongTokens(text: string, chunkSize = 24): string {
  if (!text) return text;
  const zeroWidthBreak = "\u200b";
  const tokenPattern = /[A-Za-z0-9_./:@#%?=&+-]{28,}/g;
  return text.replace(tokenPattern, (token) => {
    const parts: string[] = [];
    for (let i = 0; i < token.length; i += chunkSize) {
      parts.push(token.slice(i, i + chunkSize));
    }
    return parts.join(zeroWidthBreak);
  });
}

export function buildResumePdfModel(data: ResumeData): ResumePdfModel {
  const education: ResumeEntry[] = data.education.map((item) => ({
    title: joinNonEmpty([item.school, item.degree, item.major], " · "),
    period: joinNonEmpty([item.startDate, item.endDate], " - "),
    bullets: item.gpa ? [`GPA: ${item.gpa}`] : [],
  }));

  const internships: ResumeEntry[] = data.internships.map((item) => ({
    title: joinNonEmpty([item.company, item.position], " · "),
    period: joinNonEmpty([item.startDate, item.endDate], " - "),
    bullets: normalizedBullets(item.descriptions),
  }));

  const campus: ResumeEntry[] = data.campusExperience.map((item) => ({
    title: joinNonEmpty([item.organization, item.role], " · "),
    period: joinNonEmpty([item.startDate, item.endDate], " - "),
    bullets: normalizedBullets(item.descriptions),
  }));

  const projects: ResumeEntry[] = (data.projects ?? []).map((item) => ({
    title: joinNonEmpty([item.name, item.role], " · "),
    tags: normalizedBullets(item.techStack),
    bullets: normalizedBullets(item.descriptions),
  }));

  const skillRows: Array<{ label: string; value: string }> = [];
  if (data.skills.professional.length > 0) skillRows.push({ label: "专业技能", value: data.skills.professional.join("、") });
  if ((data.skills.languages ?? []).length > 0) skillRows.push({ label: "语言能力", value: (data.skills.languages ?? []).join("、") });
  if ((data.skills.certificates ?? []).length > 0) skillRows.push({ label: "证书", value: (data.skills.certificates ?? []).join("、") });
  if ((data.skills.tools ?? []).length > 0) skillRows.push({ label: "工具", value: (data.skills.tools ?? []).join("、") });

  return {
    name: clean(data.profile.name) || "未命名",
    contactLine: joinNonEmpty([data.profile.phone, data.profile.email, data.profile.wechat], " | "),
    targetRole: clean(data.profile.targetRole),
    education,
    internships,
    campus,
    projects,
    skillRows,
  };
}

const theme = {
  primary: "#111827",
  secondary: "#4b5563",
  muted: "#6b7280",
  border: "#e5e7eb",
  accent: "#0ea5e9",
  bgSoft: "#f8fafc",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 30,
    paddingBottom: 24,
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    lineHeight: 1.5,
    color: theme.primary,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    paddingBottom: 12,
    marginBottom: 14,
    width: "100%",
  },
  name: {
    fontSize: 23,
    color: theme.primary,
    lineHeight: 1.28,
    marginBottom: 4,
    maxWidth: "100%",
  },
  role: {
    fontSize: 11,
    color: theme.accent,
    lineHeight: 1.45,
    marginBottom: 4,
    maxWidth: "100%",
  },
  contact: {
    fontSize: 10,
    color: theme.secondary,
    lineHeight: 1.4,
    maxWidth: "100%",
  },
  section: {
    marginTop: 10,
    breakInside: "avoid",
  },
  sectionTitle: {
    fontSize: 11,
    color: theme.primary,
    marginBottom: 6,
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: theme.bgSoft,
    borderLeftWidth: 3,
    borderLeftColor: theme.accent,
  },
  entry: {
    marginBottom: 8,
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: theme.border,
    breakInside: "avoid",
  },
  entryHead: {
    flexDirection: "column",
    alignItems: "flex-start",
    marginBottom: 2,
  },
  entryTitle: {
    fontSize: 10.5,
    color: theme.primary,
    fontWeight: 700,
    lineHeight: 1.45,
    marginBottom: 1,
  },
  entryPeriod: {
    fontSize: 9.5,
    color: theme.muted,
    lineHeight: 1.35,
  },
  bullet: {
    fontSize: 9.8,
    color: theme.secondary,
    lineHeight: 1.5,
    marginTop: 2,
  },
  tags: {
    fontSize: 9.3,
    color: theme.accent,
    lineHeight: 1.35,
    marginTop: 2,
  },
  empty: {
    fontSize: 9.5,
    color: theme.muted,
    paddingLeft: 8,
  },
  skillRow: {
    marginBottom: 3,
    paddingLeft: 8,
  },
  skillLabel: {
    fontSize: 9.8,
    color: theme.primary,
    fontWeight: 700,
  },
  skillValue: {
    fontSize: 9.8,
    color: theme.secondary,
  },
});

function Section({ title, entries }: { title: string; entries: ResumeEntry[] }) {
  return (
    <View style={styles.section} wrap>
      <Text style={styles.sectionTitle}>{title}</Text>
      {entries.length === 0 ? <Text style={styles.empty}>暂无</Text> : null}
      {entries.map((entry, idx) => (
        <View key={`${title}-${idx}`} style={styles.entry} wrap>
          <View style={styles.entryHead}>
            <Text style={styles.entryTitle} wrap>{breakLongTokens(entry.title || "未填写")}</Text>
            {entry.period ? <Text style={styles.entryPeriod}>{entry.period}</Text> : null}
          </View>
          {(entry.tags ?? []).length > 0 ? <Text style={styles.tags} wrap>{`技术栈：${(entry.tags ?? []).map((tag) => breakLongTokens(tag)).join(" / ")}`}</Text> : null}
          {entry.bullets.map((bullet, bulletIdx) => (
            <Text key={`${title}-${idx}-b-${bulletIdx}`} style={styles.bullet} wrap>{`• ${breakLongTokens(bullet)}`}</Text>
          ))}
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
          {model.targetRole ? <Text style={styles.role}>{`求职方向：${model.targetRole}`}</Text> : null}
          {model.contactLine ? <Text style={styles.contact}>{model.contactLine}</Text> : null}
        </View>

        <Section title="教育经历" entries={model.education} />
        <Section title="实习经历" entries={model.internships} />
        <Section title="校园经历" entries={model.campus} />
        <Section title="项目经历" entries={model.projects} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>技能</Text>
          {model.skillRows.length === 0 ? <Text style={styles.empty}>暂无</Text> : null}
          {model.skillRows.map((row, idx) => (
            <View key={`skill-${idx}`} style={styles.skillRow}>
              <Text>
                <Text style={styles.skillLabel}>{`${row.label}：`}</Text>
                <Text style={styles.skillValue}>{row.value}</Text>
              </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export async function exportResumePdf(data: ResumeData) {
  const model = buildResumePdfModel(data);
  const blob = await pdf(<ResumeDoc model={model} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `主简历-${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
