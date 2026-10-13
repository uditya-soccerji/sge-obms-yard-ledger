"use client";

import { SetupDesk } from "@/components/equipment/setup-desk";
import { guarded } from "@/components/shared/require-module";

/** Supervisor equipment setups (docs §7, B05). */
export default guarded("equipment", SetupDesk);
