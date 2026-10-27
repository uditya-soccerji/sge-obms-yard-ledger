import type { DprRequest } from "./types";

/**
 * Items the site asks the store for, by category (owner's list, 2026-10-27).
 * Picked on the DPR's "Requests to the store"; "Other" is still typed by hand.
 */
export interface StoreCategory {
  name: string;
  /** The request kind a pick from this category starts as (can still be changed) */
  kind: DprRequest["kind"];
  items: string[];
}

export const STORE_CATALOGUE: StoreCategory[] = [
  {
    name: "Office Supplies & Stationery",
    kind: "material",
    items: ["Attendance Register", "Copy Book", "Duplicate Book", "Notebook", "Pocket Diary", "Pocket Notebook", "Black Marker", "Permanent Marker", "Colour Chalk", "Chalk Stick", "Calculator", "Cello Tape", "Duracell AAA"],
  },
  {
    name: "Pipes, Valves & Plumbing",
    kind: "spare",
    items: ['1" Pipe', '1.5" Pipe', "10 mm Pipe", "Rope 14 mm Pipe", "Hand Pipe", "Hydraulic Pipe Full Set", '28" mm SS Valve', '32" mm Valve', '32" mm Valve SS', "Valve 25mm / 32mm", "Hopper Valve", "Line Door", '1 1/2" Elbow', "Elbow", '3/4" Coupling', '1/4" T Pipe', "1/2 and 1/4 Plug Connector", "Ear Washer"],
  },
  {
    name: "Hardware & Hand Tools",
    kind: "equipment",
    items: ["Adjustable Spanner", "Alenky Pana", "12/13 Pana", "14/15 Pana", "16/17 Pana", "Ring Pana / Ring Spanner", "Screwdriver", "Axo Blade", "Buffing Machine", "Buffing Wheel", "Chipper", "Chipping Hammer", "Crapper / Scrapper", "Flap Disc", "Wire Brush", "Emery Paper", "3 Mtr Measurement Tape", "5 Meter Measurement Tape", "Letter Punch", "Staples Machine", "One Nose Pulley", "Equipment Box", "Key Lock"],
  },
  {
    name: "Painting & Coating",
    kind: "material",
    items: ["Air Less Gun", "Airless Pipe T Connector", "Jaguar Airless Washer", "Painting Gun", "Spray Gun New", "Spray Gun Holder", "Gun Holder", '1/2" Brush', '3/4" Brush', '1" Brush', '1.5" Brush', '2" Brush', '2/3" Brush', '4" Brush', "50mm Brush", "75mm Brush", "Roller Rifil", "Roller Stick", "Steer / Paint Mixture", "Avlone Tape / Evlon Tap", "Masking Tape"],
  },
  {
    name: "Air Compressor & Pneumatics",
    kind: "spare",
    items: ["Air Compressor Connector", "Air Filter (Full Set)", "Air Filter (Hopper)", "Air Quick Coupler", "Compressor Stopper", "Rapid Air Filter", "Pressure Gauge", "Air Hose", "Air Hose pipe", "Air Hose 60m", "Air Pipe 8mm", "Airless Pipe", "Twin Line Hose Pipe", "Air Clamp", "Air Hose Black Washer", "Air Hose Clamp", "Air Hose Connector", "Air Hose M/F Connector", "Airhose Washer", '1" Air Hose Connector', "Nipple", "Reductar Connector", "Quick Release Coupler", "Jugli Clamp", '37" Clamp', '42" Clamp', '47" Clamp', '48" Clamp'],
  },
  {
    name: "Sandblasting & Surface",
    kind: "spare",
    items: ["Blasting Air Washer", "Blasting Clamp", "Blasting Container", "Blasting Hood", "Blasting Hose Pipe", "Blasting Nozzle", "Blasting Wheel", "48 mm Blasting Hose Clamp", "8 mm Nozzle", "Copper Slug Channi", "Blue Deadman Pipe", "Deadman Pipe", "Dead Man Switch"],
  },
  {
    name: "Safety & PPE",
    kind: "material",
    items: ["Black Goggles", "Blasting Glass", "Blasting Goggles", "Chemical Goggles", "Face Shield", "Safety Glass", "Safety Goggles", "Cartridge Mask", "Cutter Mask", "Dust Mask", "Filter Mask", "Nose Mask", "Apron", "Chemical Gloves", "Hand Gloves", "Leather Gloves", "Nitrile Hand Gloves", "Rubber Hand Gloves", "Blasting Cloth", "Reflective Jacket", "Full Body Harness", "Yellow Helmet", "White Helmet", "Fall Arrestor", "Lifeline Rope", "Loop Lanyard", "Ear Plug"],
  },
];
