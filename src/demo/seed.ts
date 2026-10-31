import { database } from "@/db/database";
import { ledgerService } from "@/services/workledger";

/**
 * Sample ledger for the public demo: three clients, about five weeks of
 * work, one issued invoice, one draft and a running timer. Dates are
 * relative to today, so the demo always looks current. Generated through
 * the same service layer as real data, so every business rule applies.
 */

interface DemoProject {
  client: { displayName: string; companyName: string; email: string };
  name: string;
  description: string;
  rateMinor: number;
  color: string;
  tasks: string[];
  notes: string[];
}

const PROJECTS: DemoProject[] = [
  {
    client: {
      displayName: "Atlas Coffee",
      companyName: "Atlas Coffee Roasters",
      email: "billing@atlas-coffee.example",
    },
    name: "Ordering app",
    description: "Mobile ordering and pickup for six coffee shops.",
    rateMinor: 4000,
    color: "green",
    tasks: ["Checkout flow", "Menu sync", "Store dashboard"],
    notes: [
      "Built the cart summary and tip selector",
      "Fixed rounding in order totals",
      "Synced the new seasonal menu",
      "Store dashboard: live order queue",
      "Payment error states and retries",
      "Pickup time picker with store hours",
    ],
  },
  {
    client: {
      displayName: "Delta Health",
      companyName: "Delta Health Clinics",
      email: "accounts@deltahealth.example",
    },
    name: "Patient portal",
    description: "Appointment booking and visit history for patients.",
    rateMinor: 4500,
    color: "blue",
    tasks: ["Booking", "Visit history", "Accessibility review"],
    notes: [
      "Appointment booking: doctor availability grid",
      "Visit history timeline and filters",
      "Keyboard and screen reader fixes",
      "Reminder email templates",
      "Form validation for insurance details",
    ],
  },
  {
    client: {
      displayName: "Nile Studio",
      companyName: "Nile Studio Design",
      email: "hello@nilestudio.example",
    },
    name: "Website redesign",
    description: "New marketing site and case study pages.",
    rateMinor: 3500,
    color: "amber",
    tasks: ["Landing page", "Case studies", "Performance"],
    notes: [
      "Landing page hero and sections",
      "Case study template with image gallery",
      "Image optimization and lazy loading",
      "Responsive navigation",
      "Contact form and spam protection",
    ],
  },
];

/** Small deterministic random generator, so every demo looks the same. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function localDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function time(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function pick<T>(items: T[], next: () => number): T {
  return items[Math.floor(next() * items.length)] as T;
}

export async function seedDemoLedger(): Promise<void> {
  const snapshot = await ledgerService.getSnapshot();
  if (snapshot.profile) return;

  await ledgerService.saveProfile({
    displayName: "Alex Morgan",
    legalName: "Alex Morgan",
    email: "alex@example.com",
    phone: "",
    addressLine1: "12 Demo Street",
    addressLine2: "",
    city: "Cairo",
    region: "",
    postalCode: "",
    countryCode: "EG",
    taxIdentifier: "",
    accountName: "Alex Morgan",
    bankName: "Demo Bank",
    accountReference: "DEMO-0000-0000",
    swiftBic: "",
    paymentInstructions: "Sample payment details for the demo.",
  });

  const next = random(20261031);
  const projects = [];
  for (const spec of PROJECTS) {
    const client = await ledgerService.createClient({
      ...spec.client,
      legalName: spec.client.companyName,
      phone: "",
      defaultCurrency: "USD",
      invoiceNotes: "Thank you for your business.",
    });
    const project = await ledgerService.createProject({
      clientId: client.id,
      name: spec.name,
      description: spec.description,
      hourlyRateMinor: spec.rateMinor,
      currency: "USD",
      timeZone: "Africa/Cairo",
      colorToken: spec.color,
      startDate: localDate(daysAgo(60)),
      endDate: "",
    });
    const tasks = [];
    for (const name of spec.tasks) {
      tasks.push(
        await ledgerService.createTask({
          projectId: project.id,
          name,
          description: "",
        }),
      );
    }
    projects.push({
      spec,
      client,
      project,
      tasks,
      sessions: [] as { id: string; workDate: string }[],
    });
  }

  // About five weeks of weekday work, one or two sessions a day
  for (let ago = 35; ago >= 1; ago -= 1) {
    const day = daysAgo(ago);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const sessionsToday = next() < 0.35 ? 1 : 2;
    let start = 9 * 60 + Math.floor(next() * 4) * 15;
    for (let i = 0; i < sessionsToday; i += 1) {
      const entry = pick(projects, next);
      const minutes = (6 + Math.floor(next() * 9)) * 15; // 1.5h to 3.5h
      const billable = next() > 0.08;
      const session = await ledgerService.addManualSession({
        projectId: entry.project.id,
        taskId: pick(entry.tasks, next).id,
        workDate: localDate(day),
        mode: "range",
        startTime: time(start),
        endTime: time(start + minutes),
        breakMinutes: 0,
        hours: 0,
        minutes: 0,
        description: billable
          ? pick(entry.spec.notes, next)
          : "Planning and estimates (not billed)",
        billable,
        hourlyRateMinorOverride: null,
        incomplete: false,
      });
      if (billable)
        entry.sessions.push({ id: session.id, workDate: session.workDate });
      start += minutes + 45 + Math.floor(next() * 4) * 15;
    }
  }

  for (const [i, entry] of projects.entries()) {
    const first = entry.sessions[0];
    if (!first) continue;
    await ledgerService.addEvidenceLink({
      projectId: entry.project.id,
      scope: "session",
      sessionId: first.id,
      workDate: null,
      url: `https://example.com/pull/${140 + i * 7}`,
      caption: "Pull request with the finished work",
    });
  }

  // Nile Studio: work older than two weeks is invoiced and issued
  const cutoff = localDate(daysAgo(14));
  const nile = projects[2];
  if (nile) {
    const older = nile.sessions.filter((s) => s.workDate <= cutoff);
    const firstOlder = older[0];
    if (firstOlder) {
      const draft = await ledgerService.createInvoiceDraft({
        clientId: nile.client.id,
        currency: "USD",
        periodStart: firstOlder.workDate,
        periodEnd: cutoff,
        sessionIds: older.map((s) => s.id),
        notes: "Website redesign, first milestone.",
      });
      const issueDate = localDate(daysAgo(13));
      const due = localDate(new Date(daysAgo(13).getTime() + 14 * 86_400_000));
      await ledgerService.issueInvoice(draft.id, issueDate, due);
    }
  }

  // Atlas Coffee: a draft waiting to be issued
  const atlas = projects[0];
  const atlasFirst = atlas?.sessions[0];
  if (atlas && atlasFirst) {
    await ledgerService.createInvoiceDraft({
      clientId: atlas.client.id,
      currency: "USD",
      periodStart: atlasFirst.workDate,
      periodEnd: localDate(daysAgo(1)),
      sessionIds: atlas.sessions.map((s) => s.id),
      notes: "Ordering app, this month's work.",
    });
  }

  // A timer already running, so the live tracking strip shows up
  const live = projects[0];
  if (live) {
    await ledgerService.startTimer({
      projectId: live.project.id,
      taskId: live.tasks[0]?.id ?? null,
      description: "Checkout flow: final QA pass",
      billable: true,
    });
  }
}

/** Wipes the demo ledger; the next page load seeds a fresh one. */
export async function resetDemoLedger(): Promise<void> {
  database.close();
  await database.delete();
  window.location.reload();
}
