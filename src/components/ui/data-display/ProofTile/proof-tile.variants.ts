import { cva, type VariantProps } from 'class-variance-authority';

export const proofTileVariants = cva(
  [
    'bg-card rounded-xl flex flex-col items-center text-center',
    'border border-border shadow-md',
    'transition-all duration-200',
    'hover:-translate-y-1 hover:shadow-xl hover:border-brand-300',
    'h-full',
  ],
  {
    variants: {
      size: {
        /** Compact proof tile: icon and a single bold line, vertically centered */
        sm: 'p-5 gap-2 justify-center',
        /** Feature tile: icon (or number), title, and a short description */
        md: 'p-6 gap-3',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

export type ProofTileVariants = VariantProps<typeof proofTileVariants>;
