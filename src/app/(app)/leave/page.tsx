"use client";

import { LeaveRegister } from "@/components/hr/leave-register";
import { guarded } from "@/components/shared/require-module";

// Round 2 (§27): HR's leave register
export default guarded("hr", LeaveRegister);
