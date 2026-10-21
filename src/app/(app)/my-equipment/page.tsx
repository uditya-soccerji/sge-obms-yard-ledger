"use client";

import { SupervisorEquipment } from "@/components/store/equipment-register";
import { guarded } from "@/components/shared/require-module";

// Round 2 (§27): what the store issued to this supervisor, and returns
export default guarded("supervisor", SupervisorEquipment);
