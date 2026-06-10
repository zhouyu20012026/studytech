export type MemberRole = 'admin' | 'member'
export type ItemStatus = 'active' | 'archived' | 'lost'

export interface Home {
  id: string
  name: string
}

export interface Member {
  id: string
  name: string
  role: MemberRole
}

export interface Area {
  id: string
  name: string
  sortOrder: number
}

export interface Location {
  id: string
  areaId: string
  name: string
  isCommon: boolean
}

export interface Item {
  id: string
  name: string
  category?: string
  note?: string
  imageUrl?: string
  locationId: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  status: ItemStatus
}

export interface Movement {
  id: string
  itemId: string
  fromLocationId: string
  toLocationId: string
  movedBy: string
  movedAt: string
  note?: string
}

export interface InventoryState {
  home: Home
  members: Member[]
  areas: Area[]
  locations: Location[]
  items: Item[]
  movements: Movement[]
}

export interface ItemSearchResult {
  item: Item
  score: number
  matchedBy: string[]
}

export interface CreateItemInput {
  name: string
  locationId: string
  category?: string
  note?: string
}

export interface MoveItemInput {
  toLocationId: string
  note?: string
}

export interface LoginResponse {
  token: string
  user: {
    id: string
    email: string
    homeId: string
  }
}
