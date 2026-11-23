/**
 * Ambient fallback declarations for `@evenrealities/even_hub_sdk` (v0.0.14).
 *
 * These types are used ONLY while the real SDK package is not installed
 * (e.g. offline development). TypeScript resolves the real package from
 * node_modules first; this `declare module` block is a fallback and is
 * ignored once `npm install` has run.
 *
 * Source: official Even Hub docs (hub.evenrealities.com/docs, updated
 * 2026-08-29 / 2026-10-09) + the community g2-sdk reference
 * (github.com/jaydubya818/even-bridge). Verified against SDK 0.0.14 docs:
 * textColor 0-4, zOrderIndex, long-press events, 8 non-image + 4 image
 * containers per page, exactly one isEventCapture container.
 *
 * DELETE this file (or keep it — it is inert) after the real SDK installs.
 */
declare module '@evenrealities/even_hub_sdk' {
  export enum OsEventTypeList {
    CLICK_EVENT = 0,
    SCROLL_TOP_EVENT = 1,
    SCROLL_BOTTOM_EVENT = 2,
    DOUBLE_CLICK_EVENT = 3,
    FOREGROUND_ENTER_EVENT = 4,
    FOREGROUND_EXIT_EVENT = 5,
    ABNORMAL_EXIT_EVENT = 6,
    LONG_PRESS_EVENT = 7,
    LONG_PRESS_RELEASE_EVENT = 8,
  }

  export interface TextEvent {
    containerID: number
    containerName: string
    eventType?: OsEventTypeList
  }

  export interface ListEvent {
    containerID: number
    containerName: string
    currentSelectItemName?: string
    currentSelectItemIndex?: number
    eventType?: OsEventTypeList
  }

  export interface SysEvent {
    eventType?: OsEventTypeList
  }

  export interface AudioEvent {
    audioPcm?: Uint8Array
  }

  export interface EvenHubEvent {
    textEvent?: TextEvent
    listEvent?: ListEvent
    sysEvent?: SysEvent
    audioEvent?: AudioEvent
    jsonData?: unknown
  }

  export interface ContainerBaseProps {
    xPosition: number
    yPosition: number
    width: number
    height: number
    containerID: number
    containerName: string
    isEventCapture?: number
    zOrderIndex?: number
  }

  export interface TextContainerProps extends ContainerBaseProps {
    borderWidth?: number
    borderColor?: number
    paddingLength?: number
    content: string
    /** Text brightness level 0-4 (SDK 0.0.14+). Omit = device default (4). */
    textColor?: number
  }

  export interface ListItemContainerProps {
    itemCount: number
    itemWidth?: number
    isItemSelectBorderEn?: number
    itemName: string[]
  }

  export interface ListContainerProps extends ContainerBaseProps {
    borderWidth?: number
    borderColor?: number
    paddingLength?: number
    itemContainer: ListItemContainerProps | ListItemContainerProperty
  }

  export interface ImageContainerProps extends ContainerBaseProps {
    // Images start empty; pixels arrive via updateImageRawData.
  }

  export class TextContainerProperty {
    constructor(props: TextContainerProps)
  }

  export class TextContainerUpgrade {
    constructor(props: {
      containerID: number
      containerName: string
      content: string
      contentOffset?: number
      contentLength?: number
      textColor?: number
    })
  }

  export class ListItemContainerProperty {
    constructor(props: ListItemContainerProps)
  }

  export class ListContainerProperty {
    constructor(props: ListContainerProps)
  }

  export class ImageContainerProperty {
    constructor(props: ImageContainerProps)
  }

  export interface PageContainerProps {
    containerTotalNum: number
    textObject?: Array<TextContainerProperty | TextContainerProps>
    listObject?: Array<ListContainerProperty | ListContainerProps>
    imageObject?: Array<ImageContainerProperty | ImageContainerProps>
  }

  export class CreateStartUpPageContainer {
    constructor(props: PageContainerProps)
  }

  export class RebuildPageContainer {
    constructor(props: PageContainerProps)
  }

  export interface DeviceInfo {
    model?: unknown
    sn?: string
    status?: {
      batteryLevel?: number
      isWearing?: boolean
      isCharging?: boolean
      connectType?: unknown
    }
  }

  export interface UserInfo {
    uid?: string
    name?: string
    avatar?: string
    country?: string
  }

  export class EvenAppBridge {
    static getInstance(): EvenAppBridge
    /** Returns 0 on success (1 invalid, 2 oversize, 3 out of memory). */
    createStartUpPageContainer(
      page: CreateStartUpPageContainer | PageContainerProps,
    ): Promise<number>
    rebuildPageContainer(
      page: RebuildPageContainer | PageContainerProps,
    ): Promise<boolean>
    textContainerUpgrade(upgrade: TextContainerUpgrade): Promise<boolean>
    updateImageRawData(
      containerID: number,
      containerName: string,
      data: Uint8Array | ArrayBuffer | number[] | string,
      width: number,
      height: number,
    ): Promise<unknown>
    /** mode 0 = immediate exit, 1 = system exit-confirmation dialog. */
    shutDownPageContainer(mode: number): Promise<boolean>
    onEvenHubEvent(cb: (event: EvenHubEvent) => void): void
    /** true = open mic (16 kHz PCM S16LE), false = close. Hardware only. */
    audioControl(on: boolean): void
    getDeviceInfo(): Promise<DeviceInfo>
    getUserInfo(): Promise<UserInfo>
    setLocalStorage(key: string, value: string): Promise<boolean>
    getLocalStorage(key: string): Promise<string>
    onDeviceStatusChanged(
      cb: (status: NonNullable<DeviceInfo['status']>) => void,
    ): () => void
  }

  /** Resolves when the bridge is ready. Await before any other SDK call. */
  export function waitForEvenAppBridge(): Promise<EvenAppBridge>
}
