// File purpose:
// Shared seed records used by production and test storage adapters.

import { ualbanyRestaurants } from "../config.mjs";
import { hashPassword } from "../auth.mjs";

export const seedData = {
  users: [
    {
      id: "user-requester-1",
      name: "Ariana Green",
      email: "ariana.green@albany.edu",
      phone: "518-555-0141",
      password: hashPassword("demo1234"),
      authProvider: "password",
      role: "requester",
      courierMode: false,
      ualbanyIdUploaded: false,
      ualbanyIdImage: "",
      foodSafetyVerified: false,
      notificationsEnabled: false,
      courierOnline: false,
      bio: "Student who orders from the dorm, library, or a late-night study session when leaving campus spots is a hassle.",
      rating: 4.8,
      completedJobs: 12,
      earnings: 0,
    },
    {
      id: "user-courier-1",
      name: "Marcus Hall",
      email: "marcus.hall@albany.edu",
      phone: "518-555-0188",
      password: hashPassword("demo1234"),
      authProvider: "password",
      role: "courier",
      courierMode: true,
      ualbanyIdUploaded: true,
      ualbanyIdImage: "demo-ualbany-id-on-file",
      foodSafetyVerified: true,
      notificationsEnabled: true,
      courierOnline: true,
      bio: "Student courier covering dorms, libraries, and late-night campus runs when weather or darkness makes walking less appealing.",
      rating: 4.9,
      completedJobs: 34,
      earnings: 186,
    },
    {
      id: "user-admin-1",
      name: "Jordan Reyes",
      email: "jordan.reyes@albany.edu",
      phone: "518-555-0112",
      password: hashPassword("demo1234"),
      authProvider: "password",
      role: "admin",
      courierMode: false,
      ualbanyIdUploaded: true,
      ualbanyIdImage: "demo-admin-id-on-file",
      foodSafetyVerified: true,
      notificationsEnabled: true,
      courierOnline: false,
      suspended: false,
      suspendedReason: "",
      bio: "CampusConnect admin keeping delivery requests safe and campus-only.",
      rating: 5,
      completedJobs: 0,
      earnings: 0,
    },
  ],
  sessions: [],
  requests: [
    {
      id: "request-1",
      userId: "user-requester-1",
      requesterName: "Ariana Green",
      serviceType: "food",
      pickup: "Baba's Pizza",
      destination: "Eastman Tower lobby",
      time: "Today, 6:15 PM",
      payment: "7",
      notes: "Personal pizza and drink under Ariana. Please text when you leave the campus center.",
      status: "open",
      acceptedBy: null,
      createdAt: "2026-04-22T17:00:00.000Z",
    },
    {
      id: "request-2",
      userId: "user-requester-1",
      requesterName: "Ariana Green",
      serviceType: "food",
      pickup: "The Halal Shack",
      destination: "State Quad fountain",
      time: "Today, 7:00 PM",
      payment: "6",
      notes: "Chicken and rice, no onions.",
      status: "open",
      acceptedBy: null,
      createdAt: "2026-04-22T17:10:00.000Z",
    },
  ],
  messages: {
    "request-1": [
      {
        id: "message-1",
        senderId: "user-requester-1",
        senderName: "Ariana Green",
        text: "Order is already placed, just need the pickup run.",
        createdAt: "2026-04-22T17:02:00.000Z",
      },
    ],
  },
  ratings: [],
  restaurants: ualbanyRestaurants,
};

export const demoUsers = seedData.users.map((user) => ({ ...user }));

export function cloneSeedData() {
  return JSON.parse(JSON.stringify(seedData));
}
