"use client";

import { FileText, Briefcase, BookOpen, MessageSquareQuote } from "lucide-react";
import { useAppStore } from "@/store/app-store";

export function EmptyState() {
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const setCurrentFilePath = useAppStore((s) => s.setCurrentFilePath);

  if (!currentFilePath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-zinc-500">
        <FileText size={48} />
        <p>选择一个文件开始编辑</p>
      </div>
    );
  }

  const isFolder = !currentFilePath.includes(".");
  if (!isFolder) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">暂无可展示内容</div>
    );
  }

  const map = {
    "/简历": {
      icon: FileText,
      title: "创建你的第一份简历",
      desc: "填写信息后，AI 可帮你润色并导出 PDF。",
      action: () => setCurrentFilePath("/简历/主简历.json"),
      button: "开始填写简历",
    },
    "/岗位": {
      icon: Briefcase,
      title: "添加目标岗位",
      desc: "右键岗位文件夹可新建岗位并粘贴 JD。",
      action: () => {},
      button: "右键岗位新建",
    },
    "/面试准备包": {
      icon: BookOpen,
      title: "准备包会显示在这里",
      desc: "在岗位页面点击生成面试准备包。",
      action: () => {},
      button: "去岗位页操作",
    },
    "/面试复盘": {
      icon: MessageSquareQuote,
      title: "记录你的面试经历",
      desc: "右键面试复盘文件夹创建面试记录。",
      action: () => {},
      button: "右键新建记录",
    },
  } as const;

  const item = (map as Record<string, (typeof map)[keyof typeof map]>)[currentFilePath];
  if (!item) return <div className="flex h-full items-center justify-center text-zinc-500">请选择文件</div>;

  const Icon = item.icon;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-zinc-500">
      <Icon size={48} />
      <h3 className="text-base font-medium text-zinc-700 dark:text-zinc-200">{item.title}</h3>
      <p>{item.desc}</p>
      <button type="button" onClick={item.action} className="rounded-md border px-3 py-1 text-sm">
        {item.button}
      </button>
    </div>
  );
}
