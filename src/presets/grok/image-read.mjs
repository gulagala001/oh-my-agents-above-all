import { encodeConversationImage } from './image-codec.mjs';
import { transcodeNativeImage } from './native-codec.mjs';

export function registerConversationImage(ctx, imageSchema) {
  ctx.tools.register({ name: 'read_grok_image', description: 'Read PNG/JPEG/WebP/GIF/TIFF/BMP/ICO through Grok conversation compression. GIF/TIFF/ICO use the first frame/page. BMP/ICO require existing ImageMagick plus full read-only native confinement; no install or unconfined fallback. Output is at most 768 KiB base64, 1048576 pixels and 2000 pixels per side, subject to native limits. Alternate codecs and native normalization can change output.',
    parameters: { type: 'object', properties: { file_path: { type: 'string', minLength: 1 } }, required: ['file_path'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { path: { type: 'string' }, image: imageSchema }, required: ['path', 'image'], additionalProperties: false },
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }, { type: 'image', attachment: result.image }] },
    async execute(args, exec) {
      if (typeof args.file_path !== 'string' || !args.file_path.trim() || args.file_path.includes('\0') || !/\.(png|jpe?g|webp|gif|tiff?|bmp|ico)$/i.test(args.file_path))
        throw Error('read_grok_image accepts PNG/JPEG/WebP/GIF/TIFF/BMP/ICO file paths.');
      const attachments = ctx.get('attachments'), llm = ctx.get('llm');
      if (!attachments || !llm) throw Error('Image conversion requires native attachments and an image-capable model route.');
      const limits = attachments.imageLimits;
      if (limits.maxImagesPerMessage < 1 || !limits.mediaTypes.some(type => ['image/png', 'image/jpeg', 'image/webp'].includes(type)))
        throw Error('This deployment does not accept a Grok image output format.');
      const routed = exec.agent?.session.requestHeader()?.config;
      const provider = routed?.provider ?? exec.agent?.options.provider, model = routed?.model ?? exec.agent?.options.model;
      if (!provider || !model) throw Error('The calling model route could not be resolved for image output.');
      const active = await llm.resolveModelInfo(provider, model, exec.signal);
      if (!active.inputModalities?.includes('image')) throw Error('The current model does not declare image input.');
      const cwd = exec.agent ? await ctx.workingDirectory.ensure(exec.agent, exec.signal) : undefined;
      const target = await ctx.fs.resolve(args.file_path, { ...(cwd === undefined ? {} : { cwd }), signal: exec.signal });
      const info = await ctx.fs.stat(target, exec.signal);
      if (!info) { ctx.emit('fs/observed', target, { kind: 'absent' }, exec); throw Error('Image not found.'); }
      if (info.type !== 'file') throw Error('Image must be a regular file.');
      const raw = Buffer.from(await ctx.fs.readBytes(target, exec.signal, 50 * 1024 * 1024));
      exec.signal.throwIfAborted();
      if (!raw.byteLength || raw.byteLength > 50 * 1024 * 1024) throw Error('Image is empty or exceeds the 50 MiB input limit.');
      const bytes = await transcodeNativeImage(ctx, exec, raw);
      exec.signal.throwIfAborted();
      const sharp = (await import('sharp')).default;
      exec.signal.throwIfAborted();
      const encoded = await encodeConversationImage(bytes, sharp, limits, exec.signal, bytes !== raw);
      exec.signal.throwIfAborted();
      const ref = await attachments.saveImage({ ...encoded, name: 'grok-image.' + (encoded.mediaType === 'image/jpeg' ? 'jpg' : encoded.mediaType.slice(6)) });
      exec.signal.throwIfAborted();
      // The host may normalize again. Enforce the actual published reference,
      // not just an encoder candidate; no private deletion/rollback is used.
      if (!limits.mediaTypes.includes(ref.mediaType) || !['image/png', 'image/jpeg', 'image/webp'].includes(ref.mediaType)
        || !Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > Math.min(589824, limits.maxImageBytes, limits.maxMessageImageBytes)
        || !Number.isSafeInteger(ref.width) || !Number.isSafeInteger(ref.height) || ref.width < 1 || ref.height < 1
        || ref.width > Math.min(2000, limits.maxImageDimension) || ref.height > Math.min(2000, limits.maxImageDimension)
        || ref.width * ref.height > Math.min(1048576, limits.maxImagePixels))
        throw Error('Native normalized image exceeds the Grok conversation/deployment output contract.');
      ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec);
      return { path: target.displayPath, image: { attachmentId: ref.attachmentId, mediaType: ref.mediaType, bytes: ref.bytes, width: ref.width, height: ref.height,
        ...(ref.name === undefined ? {} : { name: ref.name }), ...(ref.originalDimensions === undefined ? {} : { originalDimensions: { ...ref.originalDimensions } }) } };
    },
  });
}
