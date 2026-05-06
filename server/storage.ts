/**
 * Storage helpers — substitui o proxy Forge da Manus por S3-compatible
 * (Cloudflare R2 em produção; AWS S3 também funciona setando S3_ENDPOINT vazio).
 *
 * Mantém a mesma assinatura pública (`storagePut`, `storageGet`) pra não
 * quebrar callers em routers.ts, services/documents.ts e _core/imageGeneration.ts.
 *
 * Variáveis de ambiente:
 *   - S3_ENDPOINT          ex: https://<account>.r2.cloudflarestorage.com (R2)
 *                          omitido pra usar AWS S3 padrão
 *   - AWS_ACCESS_KEY_ID    chave do R2 ou IAM user
 *   - AWS_SECRET_ACCESS_KEY
 *   - S3_BUCKET            nome do bucket (ex: rr-engine)
 *   - AWS_REGION           "auto" pra R2; us-east-1 pra AWS
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const SIGNED_URL_PUT_EXPIRES = 60 * 60 * 24 * 7; // 7 dias
const SIGNED_URL_GET_EXPIRES = 60 * 60; // 1 hora

let cachedClient: S3Client | null = null;

function getClient(): { client: S3Client; bucket: string } {
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Storage credentials missing: set S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
    );
  }

  if (cachedClient) {
    return { client: cachedClient, bucket };
  }

  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.AWS_REGION || "auto";

  cachedClient = new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return { client: cachedClient, bucket };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

/**
 * Upload de arquivo. Retorna `{ key, url }` onde `url` é uma signed URL
 * válida por 7 dias (suficiente pro fluxo de geração de propostas).
 *
 * Pra URLs permanentes, configurar bucket público + custom domain no
 * Cloudflare R2 e ler `R2_PUBLIC_BASE_URL` aqui.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const { client, bucket } = getClient();
  const key = normalizeKey(relKey);

  const body =
    typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  // Se houver R2_PUBLIC_BASE_URL (custom domain do bucket), usar URL pública.
  // Senão, signed URL com 7 dias.
  const publicBase = process.env.R2_PUBLIC_BASE_URL;
  let url: string;
  if (publicBase) {
    url = `${publicBase.replace(/\/+$/, "")}/${key}`;
  } else {
    url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: SIGNED_URL_PUT_EXPIRES }
    );
  }

  return { key, url };
}

/**
 * Gera URL temporária (signed) pra download. 1h de validade.
 */
export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const { client, bucket } = getClient();
  const key = normalizeKey(relKey);

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: SIGNED_URL_GET_EXPIRES }
  );

  return { key, url };
}
