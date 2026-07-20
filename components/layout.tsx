'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export function AnimatedContainer({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={
        prefersReducedMotion
          ? false
          : { filter: 'blur(4px)', y: -8, opacity: 0 }
      }
      whileInView={{ filter: 'blur(0px)', y: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  const highlights = useMemo(
    () =>
      Array.from({ length: 5 }, () => ({
        x: Math.floor(Math.random() * 8) * 24,
        y: Math.floor(Math.random() * 6) * 24,
      })),
    []
  );

  const id = title.replace(/\s+/g, '-').toLowerCase();

  return (
    <div className="relative overflow-hidden rounded-lg border border-border/50 bg-card p-6">
      <svg
        className="pointer-events-none absolute inset-0 size-full text-foreground mix-blend-overlay"
        style={{
          maskImage:
            'radial-gradient(circle at 70% 30%, black 20%, transparent 70%)',
        }}
      >
        <defs>
          <pattern
            id={`grid-${id}`}
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <rect
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.25}
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grid-${id})`} />
        {highlights.map((cell, i) => (
          <rect
            key={i}
            x={cell.x}
            y={cell.y}
            width="24"
            height="24"
            fill="currentColor"
            fillOpacity={0.05}
          />
        ))}
      </svg>

      <Icon className="size-6 text-foreground/75" strokeWidth={1} />
      <p className="mt-10 text-sm md:text-base font-medium">{title}</p>
      <p className="mt-2 text-xs font-light text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
