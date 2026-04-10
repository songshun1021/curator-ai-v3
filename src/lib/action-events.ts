"use client";

export type ResumeSavedDetail = {
  path: string;
};

export type JobCreatedDetail = {
  jobFolderPath: string;
};

export type ReviewGeneratedDetail = {
  interviewFolderPath: string;
  jobFolderPath?: string;
  summary: string;
};

function dispatchTypedEvent<T>(name: string, detail: T) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<T>(name, { detail }));
}

export function dispatchResumeSaved(detail: ResumeSavedDetail) {
  dispatchTypedEvent("curator:resume-saved", detail);
}

export function dispatchJobCreated(detail: JobCreatedDetail) {
  dispatchTypedEvent("curator:job-created", detail);
}

export function dispatchReviewGenerated(detail: ReviewGeneratedDetail) {
  dispatchTypedEvent("curator:review-generated", detail);
}

