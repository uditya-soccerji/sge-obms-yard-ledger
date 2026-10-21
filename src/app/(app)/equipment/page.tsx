"use client";

import { StoreEquipmentDesk } from "@/components/store/equipment-register";
import { guarded } from "@/components/shared/require-module";

// Round 2 (§27): the store's equipment register
export default guarded("store", StoreEquipmentDesk);
