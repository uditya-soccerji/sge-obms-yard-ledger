"use client";

import { CrewDesk } from "@/components/crew/crew-desk";
import { guarded } from "@/components/shared/require-module";

/** Supervisor crews (docs §20). */
export default guarded("crew", CrewDesk);
