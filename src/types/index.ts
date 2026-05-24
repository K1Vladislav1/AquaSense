export type UserRole = 'ADMIN' | 'CLIENT';

export type ProblemSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type ProblemStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface User {
  id: string;
  login: string;
  email: string;
  avatarUrl?: string | null;
  role: UserRole;
  isActive?: boolean;
}

export interface LoginResponse {
  user: User;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

export interface WaterBodyPassport {
  id?: string;
  waterBodyId?: string;
  area?: number | null;
  overgrowthArea?: number | null;
  altitude?: number | null;
  length?: number | null;
  maxWidth?: number | null;
  coastlineLength?: number | null;
  coastlineDev?: number | null;
  catchmentArea?: number | null;
  currentDepth?: number | null;
  maxDepth?: number | null;
  avgDepth?: number | null;
  volume?: number | null;
  fisheryType?: string | null;
  fishProductivity?: number | null;
  economicDesc?: string | null;
  waterProtectionZone?: string | null;
  waterProtectionStrip?: string | null;
  ichthyofauna?: string | null;
  mammals?: string | null;
  invertebrates?: string | null;
}

export interface Measurement {
  id: string;
  waterBodyId: string;
  recordDate?: string | null;
  ph?: number | null;
  turbidity?: number | null;
  dissolvedGases?: string | null;
  biogenicCompounds?: string | null;
  permanganateOxid?: number | null;
  mineralization?: number | null;
  salinity?: number | null;
  hardness?: number | null;
  calcium?: number | null;
  magnesium?: number | null;
  chlorides?: number | null;
  sulfates?: number | null;
  hydrocarbonates?: number | null;
  potassiumSodium?: number | null;
  overgrowthPercent?: number | null;
  overgrowthDegree?: string | null;
  phytoplanktonDev?: string | null;
  zooplanktonTaxa?: string | null;
  zooplanktonGroups?: string | null;
  zoobenthosTaxa?: string | null;
  zoobenthosGroups?: string | null;
  trophicStatus?: string | null;
}

export type GeoJsonPosition = [number, number, ...number[]];

export type GeoJsonPolygon = {
  type: 'Polygon';
  coordinates: GeoJsonPosition[][];
};

export type GeoJsonMultiPolygon = {
  type: 'MultiPolygon';
  coordinates: GeoJsonPosition[][][];
};

export type GeoJsonLineString = {
  type: 'LineString';
  coordinates: GeoJsonPosition[];
};

export type GeoJsonMultiLineString = {
  type: 'MultiLineString';
  coordinates: GeoJsonPosition[][];
};

export type GeoJsonBoundaryGeometry =
  | GeoJsonPolygon
  | GeoJsonMultiPolygon
  | GeoJsonLineString
  | GeoJsonMultiLineString;

export type WaterBodyBoundaries =
  | GeoJsonBoundaryGeometry
  | {
      type: 'Feature';
      geometry: GeoJsonBoundaryGeometry;
      properties?: Record<string, unknown> | null;
    }
  | {
      type: 'FeatureCollection';
      features: Array<{
        type: 'Feature';
        geometry: GeoJsonBoundaryGeometry;
        properties?: Record<string, unknown> | null;
      }>;
    };

export interface WaterBody {
  id: string;
  name: string;
  district?: string | null;
  locationDesc?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  imageUrl?: string | null;
  boundaries?: WaterBodyBoundaries | null;
  cadastralNumber?: string | null;
  passport?: WaterBodyPassport | null;
  measurements?: Measurement[];
}

export interface WaterProblem {
  id: string;
  userId: string;
  waterBodyId: string;
  title: string;
  description: string;
  severity: ProblemSeverity;
  status: ProblemStatus;
  moderationNote?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: User;
  waterBody?: WaterBody;
}

export interface UpdateProfileDto {
  login?: string;
  email?: string;
  avatarUrl?: string;
}

export interface CreateProblemDto {
  waterBodyId: string;
  title: string;
  description: string;
  severity?: ProblemSeverity;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export type NumericMeasurementKey =
  | 'ph'
  | 'turbidity'
  | 'permanganateOxid'
  | 'mineralization'
  | 'salinity'
  | 'hardness'
  | 'calcium'
  | 'magnesium'
  | 'chlorides'
  | 'sulfates'
  | 'hydrocarbonates'
  | 'potassiumSodium'
  | 'overgrowthPercent';

export interface MetricOption {
  key: NumericMeasurementKey;
  label: string;
  unit?: string;
}
