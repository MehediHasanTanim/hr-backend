export interface AppConfig {
  app: {
    nodeEnv: 'development' | 'test' | 'production';
    port: number;
    host: string;
    apiBaseUrl: string | undefined;
    webBaseUrl: string | undefined;
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
  jwt: {
    privateKey: string;
    publicKey: string;
  };
  cookie: {
    secret: string;
  };
  mail: {
    host: string;
    port: number;
    from: string;
    user: string | undefined;
    pass: string | undefined;
  };
  sso: {
    enabled: boolean;
    google: {
      clientId: string | undefined;
      clientSecret: string | undefined;
    };
  };
  log: { level: string };
  otel: {
    serviceName: string;
    exporterEndpoint: string | undefined;
    samplerArg: number;
  };
}
