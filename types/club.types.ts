// types/club.types.ts
export interface User {
  _id: string;
  fullName?: string;
  nickname?: string;
  email?: string;
  avatar?: string;
}

export interface ClubStats {
  memberCount?: number;
  eventCount?: number;
  postCount?: number;
}

export interface Club {
  _id: string;
  name: string;
  description?: string;
  sportTypes?: string[];
  visibility?: "public" | "private" | "hidden";
  joinPolicy?: "open" | "approval" | "invite_only";
  memberVisibility?: "admins" | "members" | "public";
  showRolesToMembers?: boolean;
  province?: string;
  city?: string;
  shortCode?: string;
  logoUrl?: string;
  coverUrl?: string;
  isVerified?: boolean;
  stats?: ClubStats;
  owner?: string;
  createdAt?: string;
  updatedAt?: string;
  _my?: {
    isMember?: boolean;
    membershipRole?: "owner" | "admin" | "member";
    canManage?: boolean;
    pendingRequest?: boolean;
  };
}

export interface Member {
  _id: string;
  user?: User;
  role: "owner" | "admin" | "member";
  joinedAt: string;
}

export interface Event {
  _id: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  startAt?: string;
  endAt?: string;
  capacity?: number;
  createdAt: string;
  stats?: {
    going?: number;
    notGoing?: number;
  };
}

export interface Announcement {
  _id: string;
  title?: string;
  content: string;
  pinned?: boolean;
  createdAt: string;
  author?: User;
}

export interface PollOption {
  id: string;
  _id?: string;
  text: string;
  votes?: number;
}

export interface Poll {
  _id: string;
  title: string;
  question?: string;
  options: PollOption[];
  results?: Record<string, number>;
  closedAt?: string;
  createdAt: string;
}

export interface JoinRequest {
  _id: string;
  user: User;
  message?: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}
