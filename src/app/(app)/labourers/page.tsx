"use client";

import { LabourRegister } from "@/components/master/master-desk";
import { guarded } from "@/components/shared/require-module";

// Round 2 (owner, 2026-10-21): HR's own Labourers screen
export default guarded("labourer", LabourRegister);
