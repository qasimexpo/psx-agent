import Image from "next/image";

type BannerAdProps = {
  src: string;
  alt?: string;
  className?: string;
};

export default function BannerAd({
  src,
  alt = "Advertisement banner",
  className = "",
}: BannerAdProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-200 shadow-md ${className}`}
    >
      <div className="relative aspect-[3/1] w-full sm:aspect-[4/1]">
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 1152px"
          priority
        />
        <div className="absolute inset-0 bg-[#0B132B]/10" />
        <span className="absolute right-3 top-3 rounded bg-black/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/90">
          Advertisement
        </span>
      </div>
    </div>
  );
}
