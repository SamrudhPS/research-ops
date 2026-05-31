import { readFileSync, writeFileSync, existsSync } from 'fs';
import { load, dump } from 'js-yaml';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { z } from 'zod';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROFILE_PATH = join(ROOT, 'researcher.yml');

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const ProfileSchema = z.object({
  profile: z.object({
    name: z.string().min(1, 'profile.name is required'),
    email: z.string().optional(),
    north_star_summary: z.string().optional(),
  }),

  domain: z.object({
    primary: z.string().min(1, 'domain.primary is required'),
    sub_areas: z.array(z.string()),
  }),

  skills: z.object({
    level: z.enum(['beginner', 'intermediate', 'advanced'], {
      errorMap: () => ({ message: "skills.level must be 'beginner', 'intermediate', or 'advanced'" }),
    }),
    programming: z.array(z.string()),
    tools: z.array(z.string()),
    math_comfort: z.enum(['low', 'medium', 'high'], {
      errorMap: () => ({ message: "skills.math_comfort must be 'low', 'medium', or 'high'" }),
    }),
  }),

  constraints: z.object({
    hours_per_week: z.number().positive('constraints.hours_per_week must be a positive number'),
    compute: z.enum(['laptop', 'university_cluster', 'cloud_credits'], {
      errorMap: () => ({ message: "constraints.compute must be 'laptop', 'university_cluster', or 'cloud_credits'" }),
    }),
    dataset_access: z.enum(['none', 'kaggle', 'university_library', 'open_access_only'], {
      errorMap: () => ({ message: "constraints.dataset_access must be 'none', 'kaggle', 'university_library', or 'open_access_only'" }),
    }),
  }),

  goals: z.object({
    north_star: z.enum(['conference_paper', 'thesis_chapter', 'survey', 'replication', 'learning'], {
      errorMap: () => ({ message: "goals.north_star must be 'conference_paper', 'thesis_chapter', 'survey', 'replication', or 'learning'" }),
    }),
    purpose: z.string().min(1, 'goals.purpose is required'),
    interests: z.array(z.string()),
  }),

  status: z.object({
    onboarded_at: z.string(),
    last_updated: z.string(),
  }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatZodError(err) {
  return err.errors
    .map((e) => `  • ${e.path.join('.')}: ${e.message}`)
    .join('\n');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function profileExists() {
  return existsSync(PROFILE_PATH);
}

export function readProfile() {
  if (!existsSync(PROFILE_PATH)) {
    throw new Error(
      'researcher.yml not found.\nRun `research-ops onboard` to create your profile.'
    );
  }

  let raw;
  try {
    raw = load(readFileSync(PROFILE_PATH, 'utf8'));
  } catch (e) {
    throw new Error(`researcher.yml is not valid YAML:\n  ${e.message}`);
  }

  const result = ProfileSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `researcher.yml has validation errors:\n${formatZodError(result.error)}\n\nRun \`research-ops onboard\` to fix your profile.`
    );
  }

  return result.data;
}

export function writeProfile(data) {
  const withTimestamp = {
    ...data,
    status: {
      ...data.status,
      last_updated: todayISO(),
    },
  };

  const result = ProfileSchema.safeParse(withTimestamp);
  if (!result.success) {
    throw new Error(
      `Cannot write profile — validation failed:\n${formatZodError(result.error)}`
    );
  }

  writeFileSync(
    PROFILE_PATH,
    dump(result.data, { lineWidth: -1, quotingType: '"' }),
    'utf8'
  );

  return result.data;
}

export function appendTracker(entry) {
  const trackerPath = join(ROOT, 'tracker.tsv');
  const row = [
    entry.run_id ?? crypto.randomUUID().slice(0, 8),
    entry.timestamp ?? new Date().toISOString(),
    entry.mode ?? '',
    entry.query ?? '',
    entry.result_count ?? '',
    entry.top_result ?? '',
    entry.score ?? '',
    entry.decision ?? '',
    entry.notes ?? '',
  ].join('\t');
  writeFileSync(trackerPath, row + '\n', { flag: 'a', encoding: 'utf8' });
}
