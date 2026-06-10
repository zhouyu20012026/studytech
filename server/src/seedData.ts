type SeedItem = {
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
  status: 'active' | 'archived' | 'lost'
}

export const initialInventory: {
  home: { id: string; name: string }
  members: Array<{ id: string; name: string; role: 'admin' | 'member' }>
  areas: Array<{ id: string; name: string; sortOrder: number }>
  locations: Array<{ id: string; areaId: string; name: string; isCommon: boolean }>
  items: SeedItem[]
  movements: Array<{
    id: string
    itemId: string
    fromLocationId: string
    toLocationId: string
    movedBy: string
    movedAt: string
    note?: string
  }>
} = {
  home: {
    id: 'home-1',
    name: '周家',
  },
  members: [
    { id: 'u-mom', name: '妈妈', role: 'admin' },
    { id: 'u-dad', name: '爸爸', role: 'member' },
    { id: 'u-me', name: '我', role: 'member' },
  ],
  areas: [
    { id: 'area-entry', name: '玄关', sortOrder: 1 },
    { id: 'area-living', name: '客厅', sortOrder: 2 },
    { id: 'area-bedroom', name: '卧室', sortOrder: 3 },
    { id: 'area-balcony', name: '阳台', sortOrder: 4 },
  ],
  locations: [
    { id: 'loc-shoe', areaId: 'area-entry', name: '鞋柜第一层', isCommon: true },
    { id: 'loc-tv', areaId: 'area-living', name: '电视柜左抽屉', isCommon: true },
    { id: 'loc-sofa', areaId: 'area-living', name: '沙发旁小柜', isCommon: false },
    { id: 'loc-nightstand', areaId: 'area-bedroom', name: '床头柜第一层', isCommon: true },
    { id: 'loc-wardrobe', areaId: 'area-bedroom', name: '衣柜上层收纳盒', isCommon: false },
    { id: 'loc-balcony-cabinet', areaId: 'area-balcony', name: '储物柜上层', isCommon: true },
  ],
  items: [
    {
      id: 'item-passport',
      name: '护照',
      category: '证件',
      note: '蓝色文件袋里，和户口本放一起',
      locationId: 'loc-nightstand',
      createdBy: 'u-mom',
      updatedBy: 'u-mom',
      createdAt: '2026-06-01T09:00:00.000Z',
      updatedAt: '2026-06-09T20:30:00.000Z',
      status: 'active',
    },
    {
      id: 'item-key',
      name: '备用钥匙',
      category: '钥匙',
      note: '小铁盒里',
      locationId: 'loc-shoe',
      createdBy: 'u-dad',
      updatedBy: 'u-dad',
      createdAt: '2026-06-03T18:10:00.000Z',
      updatedAt: '2026-06-08T21:00:00.000Z',
      status: 'active',
    },
    {
      id: 'item-cable',
      name: '充电线',
      category: '电子配件',
      note: '黑色 Type-C 备用线',
      locationId: 'loc-tv',
      createdBy: 'u-me',
      updatedBy: 'u-me',
      createdAt: '2026-06-02T08:00:00.000Z',
      updatedAt: '2026-06-07T19:45:00.000Z',
      status: 'active',
    },
    {
      id: 'item-thermometer',
      name: '体温计',
      category: '药品医疗',
      note: '和创可贴放在同一个透明盒',
      locationId: 'loc-balcony-cabinet',
      createdBy: 'u-mom',
      updatedBy: 'u-mom',
      createdAt: '2026-05-28T11:00:00.000Z',
      updatedAt: '2026-06-04T10:20:00.000Z',
      status: 'active',
    },
    {
      id: 'item-remote',
      name: '空调遥控器',
      category: '电器',
      note: '备用遥控器，不是客厅常用的那个',
      locationId: 'loc-sofa',
      createdBy: 'u-dad',
      updatedBy: 'u-dad',
      createdAt: '2026-05-25T09:30:00.000Z',
      updatedAt: '2026-06-01T14:10:00.000Z',
      status: 'active',
    },
  ],
  movements: [
    {
      id: 'move-passport-1',
      itemId: 'item-passport',
      fromLocationId: 'loc-tv',
      toLocationId: 'loc-nightstand',
      movedBy: 'u-mom',
      movedAt: '2026-06-09T20:30:00.000Z',
      note: '整理证件时集中到卧室',
    },
  ],
}
