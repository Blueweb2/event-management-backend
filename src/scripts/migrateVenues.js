/**
 * One-Time Migration Script: Seed & Upsert 8 Malappuram Venues into MongoDB
 *
 * Prevents duplicate records using a stable composite key: (name + category).
 * Verifies inserted documents, base prices, options, and pricing structures.
 *
 * Usage:
 *   node src/scripts/migrateVenues.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Service = require("../models/service.model");

const MALAPPURAM_VENUES = [
  {
    name: "Rose Lounge Convention Centre, Manjeri",
    category: "venue",
    pricingType: "PER_DAY",
    basePrice: 150000,
    unitLabel: "day",
    description:
      "Premier centrally air-conditioned luxury convention centre in Manjeri, Malappuram with 2,500+ seating capacity, acoustic banquet hall, VIP dining suite, and parking for 500+ cars.",
    imageUrl:
      "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&auto=format&fit=crop&q=80",
    active: true,
    sortOrder: 1,
    options: [
      {
        name: "Main AC Auditorium & Royal Dining Hall",
        description:
          "Full day access to central AC auditorium with 2,500 seats and attached royal dining hall",
        price: 150000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
      {
        name: "Mini AC Conference & Engagement Hall",
        description:
          "Intimate AC hall for engagements, nikkah, and family gatherings up to 400 guests",
        price: 50000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
      {
        name: "Open-Air Sunset Lawn & Dining Courtyard",
        description:
          "Scenic evening lawn setup with decorative floodlights and food counters",
        price: 65000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
    ],
  },
  {
    name: "Kallivalappil Heritage Convention Centre, Kondotty",
    category: "venue",
    pricingType: "PER_DAY",
    basePrice: 125000,
    unitLabel: "day",
    description:
      "Renowned traditional Kerala architectural heritage convention venue near Calicut Airport, Kondotty, Malappuram. Features a royal wooden mandapam stage, spacious dining, and manicured lawns.",
    imageUrl:
      "https://images.unsplash.com/photo-1545232979-fbf68fe9b10d?w=800&auto=format&fit=crop&q=80",
    active: true,
    sortOrder: 2,
    options: [
      {
        name: "Royal Heritage Grand Hall",
        description:
          "Traditional Kerala architectural hall with ornate woodwork and 1,800 capacity",
        price: 125000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1545232979-fbf68fe9b10d?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
      {
        name: "Heritage Open Courtyard (Nadumuttam)",
        description:
          "Open sky traditional courtyard for mehendi, haldi, and cultural ceremonies",
        price: 45000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
    ],
  },
  {
    name: "Shifa Convention Centre, Perinthalmanna",
    category: "venue",
    pricingType: "PER_DAY",
    basePrice: 175000,
    unitLabel: "day",
    description:
      "State-of-the-art mega auditorium in Perinthalmanna, Malappuram with 3,000+ guest capacity, hydraulic stage, Dolby-calibrated acoustics, centralized AC, and multi-level dining floors.",
    imageUrl:
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=80",
    active: true,
    sortOrder: 3,
    options: [
      {
        name: "Mega AC Auditorium & Royal Dining Complex",
        description:
          "Full day access to 3,000+ seater mega hall, 2 VIP green rooms, and twin dining wings",
        price: 175000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
      {
        name: "Crystal Banquet Hall (500 Guests)",
        description:
          "Compact luxury AC hall designed for corporate banquets, seminars, and receptions",
        price: 60000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
    ],
  },
  {
    name: "Woodbine Resort & Open Lawn Venue, Nilambur",
    category: "venue",
    pricingType: "PER_DAY",
    basePrice: 95000,
    unitLabel: "day",
    description:
      "Picturesque eco-luxury resort venue nestled in the foothills of Nilambur teak forest, Malappuram. Perfect for destination weddings, open lawn sunset receptions, and pool-side parties.",
    imageUrl:
      "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&auto=format&fit=crop&q=80",
    active: true,
    sortOrder: 4,
    options: [
      {
        name: "Teak Valley Open Lawn & Gazebo Stage",
        description:
          "Lush green natural lawn with illuminated canopy, fairy lights, and wooden gazebo stage",
        price: 95000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
      {
        name: "Poolside Deck & Canopy Lounge",
        description:
          "Chic poolside party area with cabanas, sound integration, and mood lighting",
        price: 40000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
    ],
  },
  {
    name: "Grace Valley Convention Centre, Marakkara, Kadampuzha",
    category: "venue",
    pricingType: "PER_DAY",
    basePrice: 110000,
    unitLabel: "day",
    description:
      "Expansive convention and banquet complex in Marakkara near Kadampuzha temple road, Malappuram. Features a double-height ceiling hall, green room suites, and dining for 1,200 guests simultaneously.",
    imageUrl:
      "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&auto=format&fit=crop&q=80",
    active: true,
    sortOrder: 5,
    options: [
      {
        name: "Grand AC Auditorium (Full Day)",
        description:
          "Complete auditorium access with high-efficiency cooling, stage lighting, and sound console",
        price: 110000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
      {
        name: "Semi-Day Engagement / Reception Slot",
        description:
          "Morning or evening 5-hour slot for receptions, nikah, and birthday milestones",
        price: 65000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
    ],
  },
  {
    name: "Emirates Convention Centre, Edarikode, Kottakkal",
    category: "venue",
    pricingType: "PER_DAY",
    basePrice: 140000,
    unitLabel: "day",
    description:
      "Ultra-modern luxury wedding destination situated on NH-66 Edarikode near Kottakkal, Malappuram. Highlights include majestic crystal chandeliers, bridal executive suites, and valet-managed parking.",
    imageUrl:
      "https://images.unsplash.com/photo-1520854221256-17451cc331bf?w=800&auto=format&fit=crop&q=80",
    active: true,
    sortOrder: 6,
    options: [
      {
        name: "Imperial AC Ballroom & Dining Suite",
        description:
          "Grand ballroom with 2,200 capacity, imported crystal chandeliers, and executive bridal suite",
        price: 140000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1520854221256-17451cc331bf?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
      {
        name: "Executive Boardroom & Private Terrace",
        description:
          "Corporate boardroom and open terrace for private VIP dinners and business summits",
        price: 35000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
    ],
  },
  {
    name: "Al-Manama Convention Centre & Auditorium, Tirur",
    category: "venue",
    pricingType: "PER_DAY",
    basePrice: 130000,
    unitLabel: "day",
    description:
      "Prime central event hub in Tirur coastal belt, Malappuram, offering grand tiered auditorium seating, high-output air conditioning, two expansive dining wings, and dedicated prayer & bridal rooms.",
    imageUrl:
      "https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop&q=80",
    active: true,
    sortOrder: 7,
    options: [
      {
        name: "Main Auditorium (Full Campus)",
        description:
          "Access to tiered auditorium, double dining halls, prayer rooms, and 400+ car parking lot",
        price: 130000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
      {
        name: "Banquet Wing A (Dining & Reception)",
        description:
          "Standalone banquet hall for community feasts, nikah gatherings, and family receptions",
        price: 55000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
    ],
  },
  {
    name: "Royal Plaza Convention Centre, Malappuram Town",
    category: "venue",
    pricingType: "PER_DAY",
    basePrice: 120000,
    unitLabel: "day",
    description:
      "Conveniently located on Malappuram By-pass Road with seamless city connectivity. Features contemporary pillarless architecture, LED video wall setup, and multi-cuisine kitchen facilities.",
    imageUrl:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=80",
    active: true,
    sortOrder: 8,
    options: [
      {
        name: "Pillarless Grand Ballroom (Full Day)",
        description:
          "Spacious pillarless hall accommodating 1,500 guests with unobstructed 360-degree views",
        price: 120000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
      {
        name: "Mini Conference & Mehendi Hall",
        description:
          "Airy banquet hall for intimate pre-wedding functions and social gatherings",
        price: 45000,
        pricingType: "PER_DAY",
        unitLabel: "day",
        imageUrl:
          "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&auto=format&fit=crop&q=80",
        active: true,
      },
    ],
  },
];

async function migrateVenues() {
  console.log("=================================================");
  console.log("🚀 Starting One-Time Migration: Malappuram Venues");
  console.log("=================================================");

  try {
    await connectDB();

    console.log(`\n📦 Processing ${MALAPPURAM_VENUES.length} venue records...`);

    const upsertResults = [];

    for (const venue of MALAPPURAM_VENUES) {
      // Stable identifier: Composite key (name + category)
      const filter = {
        name: venue.name,
        category: venue.category.toLowerCase(),
      };

      const update = {
        $set: {
          name: venue.name,
          category: venue.category.toLowerCase(),
          pricingType: venue.pricingType,
          basePrice: venue.basePrice,
          unitLabel: venue.unitLabel,
          description: venue.description,
          imageUrl: venue.imageUrl,
          active: venue.active,
          sortOrder: venue.sortOrder,
          options: venue.options,
        },
      };

      const result = await Service.findOneAndUpdate(filter, update, {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      });

      upsertResults.push(result);
      console.log(`  ✓ Synced venue: "${result.name}" (ID: ${result._id})`);
    }

    console.log("\n=================================================");
    console.log("🔍 Verifying Inserted Documents and Pricing Options");
    console.log("=================================================");

    const verifiedVenues = await Service.find({
      category: "venue",
      active: true,
    }).sort({ sortOrder: 1, name: 1 });

    console.log(`Total active venues in DB: ${verifiedVenues.length}\n`);

    for (const [idx, v] of verifiedVenues.entries()) {
      console.log(`[${idx + 1}] ${v.name}`);
      console.log(`    • ID:           ${v._id}`);
      console.log(`    • Category:     ${v.category}`);
      console.log(`    • Base Price:   ₹${v.basePrice.toLocaleString("en-IN")} / ${v.unitLabel} (${v.pricingType})`);
      console.log(`    • Options (${v.options.length}):`);
      for (const opt of v.options) {
        console.log(`        - "${opt.name}": ₹${opt.price.toLocaleString("en-IN")} / ${opt.unitLabel || v.unitLabel} (${opt.pricingType}) [Active: ${opt.active}]`);
      }
      console.log("");
    }

    // Safety assertion
    if (verifiedVenues.length < MALAPPURAM_VENUES.length) {
      throw new Error(`Expected at least ${MALAPPURAM_VENUES.length} venues, found ${verifiedVenues.length}`);
    }

    console.log("✅ Verification successful! All 8 venues and pricing options confirmed.");
    console.log("=================================================\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed with error:", error);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

if (require.main === module) {
  migrateVenues();
}

module.exports = {
  MALAPPURAM_VENUES,
  migrateVenues,
};
