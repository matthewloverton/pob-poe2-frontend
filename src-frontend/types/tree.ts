export type NodeId = number;
export type GroupId = number;

export interface NodeConnection {
  id: NodeId;
  orbit: number;
}

export interface NodeOption {
  id: number;
  name: string;
  icon?: string;
  stats?: string[];
}

export interface PassiveNode {
  skill: number;
  name?: string;
  icon?: string;
  group?: GroupId;
  orbit?: number;
  orbitIndex?: number;
  connections?: NodeConnection[];
  isNotable?: boolean;
  isKeystone?: boolean;
  isJewelSocket?: boolean;
  isAscendancyStart?: boolean;
  isAttribute?: boolean;
  isMultipleChoiceOption?: boolean;
  isFreeAllocate?: boolean;
  options?: NodeOption[];
  ascendancyName?: string;
  classesStart?: string[];
  stats?: string[];
  [key: string]: unknown;
}

export interface PassiveGroup {
  x: number;
  y: number;
  orbits?: number[] | Record<string, unknown>;
  nodes?: string[];
  [key: string]: unknown;
}

export interface TreeConstants {
  skillsPerOrbit: number[];
  orbitRadii: number[];
  orbitAnglesByOrbit?: number[][];
  PSSCentreInnerRadius?: number;
  [key: string]: unknown;
}

export interface TreeBackground {
  image: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Inner "bg" frame size — the BGTree ornate ring size per-class. */
  bg?: { width: number; height: number };
  active?: { width: number; height: number };
}

export interface TreeAscendancyClass {
  id: string;
  name: string;
  background?: TreeBackground;
  [key: string]: unknown;
}

export interface TreeClass {
  name: string;
  integerId: number;
  background?: TreeBackground;
  ascendancies?: TreeAscendancyClass[];
  [key: string]: unknown;
}

export interface PassiveTree {
  nodes: Record<string, PassiveNode>;
  groups: Record<string, PassiveGroup>;
  constants: TreeConstants;
  classes?: TreeClass[];
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  [key: string]: unknown;
}

export interface Manifest {
  appVersion: string;
  upstreamSha: string;
  treeVersion: string;
  generatedAt: string;
}
