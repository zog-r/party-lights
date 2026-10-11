// GENERATED from site/event.json by scripts/gen-event.js. Do not edit.
const EVENT = {
  "$schema": "../event.schema.json",
  "event_type": "holiday_party",
  "features": [
    "schedule",
    "menu",
    "policies",
    "reminders",
    "guest_list",
    "place",
    "stay",
    "rooms",
    "trips"
  ],
  "title": "Winter Supper at the Cabin",
  "title_em": "at the Cabin",
  "brand": "The Cabin",
  "tagline": "A weekend of friends, family, and a long table of good food.",
  "intro": "We're opening up the cabin to friends and family. Come for the big supper Saturday, or stay the whole weekend if you can. Kids are welcome. Sorry, no pets this time.",
  "description": "The cabin sleeps twelve in beds, with plenty of couch space for anyone who'd rather crash by the fire. Arrive Friday and leave Sunday, or come anytime in between. The main supper is Saturday night. Family-friendly: kids and babies welcome.",
  "area": "Pine Hollow",
  "timezone": "America/Denver",
  "site_url": "",
  "api_url": "",
  "main": {
    "start": "2026-12-19T17:00",
    "end": "2026-12-19T23:00",
    "label": "Winter supper"
  },
  "stay": {
    "earliest_arrival": "2026-12-18",
    "latest_departure": "2026-12-20",
    "nights": 2
  },
  "policies": {
    "pets": false,
    "kids": true
  },
  "images": {
    "hero": {
      "src": "assets/hero.jpg",
      "alt": "The cabin at dusk, windows lit."
    },
    "feature": {
      "src": "assets/feature.jpg",
      "alt": "The long table set for supper."
    },
    "evening": {
      "src": "assets/evening.jpg",
      "alt": "The living room in the evening, lamps on."
    }
  },
  "schedule": [
    {
      "date": "2026-12-18",
      "title": "Arrive early, stay over",
      "text": "Plenty of beds and couch space. Let us know if you'd like a room."
    },
    {
      "date": "2026-12-19",
      "title": "The winter supper, 5 PM",
      "text": "Breakfast and lunch for anyone staying over. Bring a dish or drinks:",
      "link": {
        "label": "see the menu",
        "href": "menu.html"
      }
    },
    {
      "date": "2026-12-20",
      "title": "Slow morning",
      "text": "Coffee by the fire, head home, or join a day trip"
    }
  ],
  "house": {
    "name": "The Cabin",
    "stats": [
      "5 bedrooms",
      "3 baths",
      "sleeps 12",
      "wood stove"
    ],
    "blurb": "One long table, a big kitchen for cooking together, deep couches, and a porch that looks out over the trees.",
    "about": [
      "A cabin with room for the whole crew: five bedrooms, three baths, and deep couches for anyone who'd rather crash by the fire.",
      "Arrive Friday, leave Sunday, or come for just the supper on Saturday night."
    ],
    "offers": [
      "Wood stove",
      "Long dining table",
      "Big kitchen",
      "Covered porch",
      "Kids welcome"
    ],
    "not_offered": [
      "No pets this time"
    ],
    "gallery": [
      {
        "src": "assets/room-1.jpg",
        "alt": "The kitchen."
      },
      {
        "src": "assets/room-2.jpg",
        "alt": "The porch."
      },
      {
        "src": "assets/room-3.jpg",
        "alt": "The dining table."
      },
      {
        "src": "assets/room-4.jpg",
        "alt": "The living room."
      }
    ],
    "spaces": [
      {
        "src": "assets/room-1.jpg",
        "alt": "The kitchen.",
        "label": "Kitchen",
        "title": "Cook together",
        "text": "Room for a few cooks and a taster or two. Every meal starts here."
      },
      {
        "src": "assets/room-4.jpg",
        "alt": "The living room.",
        "label": "Living room",
        "title": "Warm up",
        "text": "Deep couches by the wood stove for naps, games, and late conversations."
      }
    ],
    "kicker": "Pine Hollow"
  },
  "reply": {
    "title": "Pull up a chair",
    "sub": "Tell us who's coming so we can plan beds and food."
  },
  "trips_intro": "Snowshoe the ridge, find a hot spring, or dream up your own. Propose one, volunteer to lead, or tag along.",
  "rooms": {
    "list": [
      {
        "id": "q1",
        "beds": "1 queen"
      },
      {
        "id": "q2",
        "beds": "1 queen"
      },
      {
        "id": "bunk",
        "beds": "2 bunk beds"
      },
      {
        "id": "tw",
        "beds": "2 twins"
      },
      {
        "id": "k",
        "beds": "1 king",
        "reserved": true
      }
    ],
    "total": 5,
    "host_reserved": 1
  },
  "food_slots": [
    {
      "id": "fri_dinner",
      "meal": "Friday dinner",
      "label": "Friday dinner",
      "suggestions": [
        "Chili",
        "Pizza night",
        "Soup & bread"
      ]
    },
    {
      "id": "sat_breakfast",
      "meal": "Saturday breakfast",
      "label": "Saturday breakfast",
      "suggestions": [
        "Pancakes",
        "Fruit platter",
        "Coffee & juice"
      ]
    },
    {
      "id": "supper_apps",
      "meal": "Saturday supper",
      "label": "Apps",
      "suggestions": [
        "Cheese board",
        "Crudités"
      ]
    },
    {
      "id": "supper_mains",
      "meal": "Saturday supper",
      "label": "Mains",
      "suggestions": [
        "Roast chicken",
        "Braised short ribs",
        "Veggie lasagna"
      ]
    },
    {
      "id": "supper_sides",
      "meal": "Saturday supper",
      "label": "Sides",
      "suggestions": [
        "Mashed potatoes",
        "Roasted veggies",
        "Rolls"
      ]
    },
    {
      "id": "supper_dessert",
      "meal": "Saturday supper",
      "label": "Dessert",
      "suggestions": [
        "Pie",
        "Cookies"
      ]
    },
    {
      "id": "drinks",
      "meal": "Drinks",
      "label": "Drinks",
      "suggestions": [
        "Wine",
        "Hot cocoa",
        "Sparkling water"
      ]
    }
  ],
  "trip_seeds": [
    {
      "title": "Snowshoe the ridge",
      "details": "A couple of hours out and back."
    },
    {
      "title": "Hot springs",
      "details": "Great on the way in or out."
    }
  ],
  "reminders": {
    "remind_days": [
      30,
      14
    ],
    "confirm_days": [
      14,
      5
    ]
  },
  "when_text": "Sat, Dec 19 · 5 PM",
  "stay_text": "Stay Fri–Sun, optional",
  "stay_days": [
    {
      "id": "fri",
      "label": "Fri 12/18"
    },
    {
      "id": "sat",
      "label": "Sat 12/19"
    },
    {
      "id": "sun",
      "label": "Sun 12/20"
    }
  ]
};
