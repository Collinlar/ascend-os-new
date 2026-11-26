// Which capability earns which part of Office.
//
// One table, read by the page, the action route and the board, so what a
// screen offers and what the server accepts cannot drift apart.
//
// Office is a paid set, but the PRD embeds the parts of it a till, a shop or
// a bookings business cannot trade without: POS carries attendance and
// shifts, Shop carries fulfilment assignment, Services carries provider
// assignment (Office PRD 12, 31). Gating everything on office.work would put
// those businesses behind a door nobody gave them a key to. So each part
// lists every capability that earns it, taken from the register in 0044:
// the paid sets and the embedded essentials that carry the same job.
//
// Office monetises broader team management, attendance, leave, procurement,
// approvals, work management and multi-location coordination (Office PRD
// 12). Anything in that list needs office.work or a register capability that
// only the Office set grants.
//
// Refund and discount approvals are the one place this is not obvious. A
// till raises them (0031) and this board is where they are decided, so a
// business holding pos.refunds must be able to decide them without Office.
//
// No server imports here on purpose: the board is a client component and
// reads the same table.

/** Reaching /work at all. Mirrors the nav (lib/nav/workspace.ts). */
export const OFFICE_ENTRY: readonly string[] = [
  "office.work",
  "office.basic_attendance",
  "office.basic_shifts",
  "office.basic_order_assignment",
  "people.provider_assignment",
];

/** What each section of the screen needs. */
export const OFFICE_MODULES = {
  /** The owner's daily view across the team. Paid. */
  commandCentre: ["office.work"],
  /** Bookings, leave, jobs and tasks in one list. The reason to buy the set. */
  schedule: ["office.work"],
  /** Checking in and out. Carried by POS. */
  attendance: ["office.work", "office.basic_attendance"],
  /** Deciding what is waiting. Carried by POS for till refunds. */
  approvals: ["office.work", "work.approvals", "pos.refunds"],
  /** Work handed to you. Shop and Services hand work out as tasks. */
  tasks: [
    "office.work",
    "work.core",
    "office.basic_order_assignment",
    "people.provider_assignment",
  ],
  /** Making new work and multi-step jobs. Paid. */
  projects: ["office.work", "work.core"],
  /** Time off. Paid. */
  leave: ["office.work"],
  /** Asking to buy something. Paid. */
  purchases: ["office.work"],
  /** Recording money spent, with approval above a limit. Paid. */
  expenses: ["office.work"],
} as const satisfies Record<string, readonly string[]>;

export type OfficeModule = keyof typeof OFFICE_MODULES;
export type OfficeModules = Record<OfficeModule, boolean>;

/**
 * What each action on the Office route needs. `null` means the action is not
 * an Office feature at all and is left to the route's own checks.
 */
export const OFFICE_ACTIONS: Record<string, readonly string[] | null> = {
  attendance: OFFICE_MODULES.attendance,
  complete_task: OFFICE_MODULES.tasks,
  move_task: OFFICE_MODULES.tasks,
  create_task: OFFICE_MODULES.projects,
  create_project: OFFICE_MODULES.projects,
  decide_approval: OFFICE_MODULES.approvals,
  request_leave: OFFICE_MODULES.leave,
  request_purchase: OFFICE_MODULES.purchases,
  submit_expense: OFFICE_MODULES.expenses,
  // Giving a booking to a person. Services carries this on its own.
  assign_booking: ["office.work", "people.provider_assignment"],
  // Who is on the team and what they may do. The same two capabilities that
  // earn the Team screen.
  change_role: ["people.core", "people.cashiers"],
  // Where the business trades from is business setup, not Office.
  save_location: null,
};

export function holdsAny(
  capabilities: ReadonlySet<string>,
  needed: readonly string[]
): boolean {
  return needed.some((capability) => capabilities.has(capability));
}

export function canEnterOffice(capabilities: ReadonlySet<string>): boolean {
  return holdsAny(capabilities, OFFICE_ENTRY);
}

export function officeModules(capabilities: ReadonlySet<string>): OfficeModules {
  const out = {} as OfficeModules;
  for (const key of Object.keys(OFFICE_MODULES) as OfficeModule[]) {
    out[key] = holdsAny(capabilities, OFFICE_MODULES[key]);
  }
  return out;
}

/**
 * true: allowed. false: this business does not have it. null: the action is
 * not gated here, or is not one we know, and the caller decides.
 */
export function actionAllowed(
  capabilities: ReadonlySet<string>,
  action: string
): boolean | null {
  if (!(action in OFFICE_ACTIONS)) return null;
  const needed = OFFICE_ACTIONS[action];
  if (needed === null) return null;
  return holdsAny(capabilities, needed);
}
