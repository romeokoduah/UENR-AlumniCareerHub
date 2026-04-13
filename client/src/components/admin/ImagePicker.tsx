import { useRef, useState } from 'react';
import { Upload, Link2, X, ImagePlus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

type Props = {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  aspect?: 'square' | 'portrait' | 'landscape' | 'wide';
  compact?: boolean;
};

const aspectClass = {
  square: 'aspect-square',
  portrait: 'aspect-[4/5]',
  landscape: 'aspect-[4/3]',
  wide: 'aspect-[16/9]'
};

export function ImagePicker({ value, onChange, label, aspect = 'portrait', compact = false }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showUrlField, setShowUrlField] = useState(false);

  const onFileSelected = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      return toast.error('Image must be under 8 MB');
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post('/admin/uploads/image', body, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onChange(data.data.url);
      toast.success('Uploaded');
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const applyUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    onChange(trimmed);
    setUrlInput('');
    setShowUrlField(false);
    toast.success('URL applied');
  };

  const clear = () => onChange('');

  return (
    <div className={compact ? '' : 'space-y-2'}>
      {label && <div className="text-xs font-semibold">{label}</div>}

      <div className={`group relative overflow-hidden rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--bg)] ${aspectClass[aspect]}`}>
        {value ? (
          <>
            <img src={value} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-end justify-end gap-1 bg-black/0 p-2 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="rounded-lg bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-white"
                title="Replace with upload"
              >
                <Upload size={12} className="inline mr-1" />
                Upload
              </button>
              <button
                type="button"
                onClick={() => setShowUrlField(true)}
                className="rounded-lg bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-white"
                title="Use URL"
              >
                <Link2 size={12} className="inline mr-1" />
                URL
              </button>
              <button
                type="button"
                onClick={clear}
                className="rounded-lg bg-rose-500/95 px-2 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
                title="Remove"
              >
                <X size={12} />
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/5"
          >
            <ImagePlus size={28} />
            <span className="text-xs font-semibold">Upload or paste URL</span>
          </button>
        )}

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
            <Loader2 size={24} className="animate-spin" />
          </div>
        )}
      </div>

      {showUrlField && (
        <div className="flex gap-1.5">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://..."
            className="input py-1.5 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applyUrl())}
          />
          <button
            type="button"
            onClick={applyUrl}
            className="rounded-lg bg-[#065F46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#064E3B]"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => { setShowUrlField(false); setUrlInput(''); }}
            className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {!compact && !showUrlField && !value && (
        <button
          type="button"
          onClick={() => setShowUrlField(true)}
          className="text-xs text-[var(--muted)] hover:text-[var(--fg)] inline-flex items-center gap-1"
        >
          <Link2 size={12} /> or paste a URL
        </button>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])}
      />
    </div>
  );
}
