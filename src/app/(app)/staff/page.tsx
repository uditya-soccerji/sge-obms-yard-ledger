"use client";

import { StaffRegister } from "@/components/hr/staff-register";
import { guarded } from "@/components/shared/require-module";

// Round 2 (§27): HR's staff list
export default guarded("hr", StaffRegister);
