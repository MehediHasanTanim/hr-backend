export interface AppConfig {
  app: {
    nodeEnv: 'development' | 'test' | 'production';
    port: number;
    host: string;
    apiBaseUrl: string | undefined;
    corsOrigin: string[] | undefined;
    swaggerEnabled: boolean;
  };
  db: {
    url: string;
    poolMin: number;
    poolMax: number;
  };
  redis: { url: string };
  minio: {
    endpoint: string;
    port: number;
    accessKey: string;
    secretKey: string;
    useSsl: boolean;
    bucketName: string;
  };
  auth: {
    jwtSecret: string;
    jwtExpiresIn: string;
    refreshTokenExpiresIn: string;
  };
  log: { level: string };
  otel: {
    serviceName: string;
    exporterEndpoint: string | undefined;
    samplerArg: number;
  };
}
