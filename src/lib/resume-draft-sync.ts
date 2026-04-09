import { ResumeData } from "@/types";

type DraftController = {
  getSnapshot: () => ResumeData | null;
  flush: () => Promise<void>;
};

const controllers = new Map<string, DraftController>();

export function registerResumeDraftController(path: string, controller: DraftController) {
  controllers.set(path, controller);
  return () => {
    const current = controllers.get(path);
    if (current === controller) controllers.delete(path);
  };
}

export async function flushResumeDraft(path: string): Promise<void> {
  const controller = controllers.get(path);
  if (!controller) return;
  await controller.flush();
}

export function getResumeDraftSnapshot(path: string): ResumeData | null {
  const controller = controllers.get(path);
  if (!controller) return null;
  return controller.getSnapshot();
}
