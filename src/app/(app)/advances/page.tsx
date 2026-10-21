"use client";

import { AdvancesRegister } from "@/components/finance/advances";
import { guarded } from "@/components/shared/require-module";

// Round 2 (§27): labourer advances and recovery
export default guarded("finance", AdvancesRegister);
