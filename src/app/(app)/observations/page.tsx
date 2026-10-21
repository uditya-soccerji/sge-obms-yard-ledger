"use client";

import { SafetyObservationsDesk } from "@/components/safety/observations";
import { guarded } from "@/components/shared/require-module";

// Round 2 (§27): Safety raises observations and stop-work calls
export default guarded("safety", SafetyObservationsDesk);
