import { motion, AnimatePresence } from 'motion/react';

/**
 * Floating drag preview overlay — shows a scaled, elevated copy of the dragged item.
 * Wrap content in this component and pass draggedItem to show/hide.
 */
export function DragPreviewOverlay({ draggedItem, children, className = '' }) {
  return (
    <AnimatePresence>
      {draggedItem && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85, rotate: 0 }}
          animate={{ opacity: 1, scale: 1.06, rotate: 1.5, boxShadow: '0 16px 40px rgba(0,0,0,0.14)' }}
          exit={{ opacity: 0, scale: 0.9, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 28, mass: 0.6 }}
          className={`pointer-events-none fixed z-50 ${className}`}
          style={{ willChange: 'transform, opacity' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Animated drop zone wrapper — glows and expands when hovered during drag.
 */
export function AnimatedDropZone({
  isHovered = false,
  isEmpty = true,
  isDragActive = false,
  disabled = false,
  onClick,
  onDrop,
  onDragOver,
  children,
  className = '',
  hoverClassName = '',
}) {
  return (
    <motion.div
      animate={{
        scale: isHovered && !disabled ? 1.02 : 1,
        borderColor: isHovered && !disabled
          ? 'rgba(24,24,27,1)'
          : isEmpty
            ? 'rgba(212,212,216,1)'
            : 'rgba(24,24,27,0.5)',
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={onClick}
      onDrop={onDrop}
      onDragOver={onDragOver}
      className={`${className} ${isHovered && !disabled ? hoverClassName : ''}`}
    >
      {children}
    </motion.div>
  );
}

/**
 * Animated draggable item in word banks / answer banks.
 * Handles enter/exit/layout animations automatically.
 */
export function AnimatedBankItem({
  item,
  isSelected = false,
  isDragging = false,
  disabled = false,
  draggable = true,
  onDragStart,
  onDragEnd,
  onClick,
  children,
  className = '',
  selectedClassName = 'border-zinc-900 bg-zinc-900 text-white',
  defaultClassName = 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:-translate-y-0.5 hover:border-zinc-900 hover:bg-white cursor-grab active:cursor-grabbing',
}) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.85, y: 6 }}
      animate={{
        opacity: 1,
        scale: isDragging ? 1.05 : isSelected ? 1.04 : 1,
        y: 0,
      }}
      exit={{ opacity: 0, scale: 0.8, y: -4, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.8 }}
      whileHover={!disabled && !isSelected ? { y: -2, transition: { duration: 0.15 } } : undefined}
      whileTap={!disabled ? { scale: 0.97 } : undefined}
      type="button"
      draggable={draggable && !disabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      disabled={disabled}
      className={`${className} ${isSelected || isDragging ? selectedClassName : defaultClassName}`}
    >
      {children}
    </motion.button>
  );
}

/**
 * Animated blank/slot — inline drop target for DragToBlank & WordHide tasks.
 * Shows ghost preview when hovered.
 */
export function AnimatedBlankSlot({
  value,
  ghostPreview = null,
  isHovered = false,
  isCorrect = false,
  isWrong = false,
  submitted = false,
  disabled = false,
  onClick,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  className = '',
}) {
  return (
    <motion.button
      layout
      type="button"
      onClick={onClick}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      disabled={disabled}
      animate={{
        scale: isCorrect ? [1, 1.07, 1] : isWrong ? 1 : isHovered ? 1.03 : 1,
        x: isWrong ? [0, -5, 5, -3, 3, 0] : 0,
      }}
      transition={{
        scale: { type: 'spring', stiffness: 400, damping: 20 },
        x: { duration: 0.4 },
      }}
      className={[
        'relative mx-1 my-1 inline-flex min-h-12 min-w-28 items-center justify-center border px-3 py-2 text-sm font-medium transition-colors duration-200 md:min-h-14 md:min-w-32',
        isCorrect ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : '',
        isWrong ? 'border-red-400 bg-red-50 text-red-900' : '',
        !submitted && value ? 'border-zinc-900 bg-white text-zinc-900 shadow-[0_10px_30px_rgba(0,0,0,0.06)]' : '',
        !submitted && !value && isHovered ? 'border-zinc-900 bg-zinc-50 border-solid' : '',
        !submitted && !value && !isHovered ? 'border-dashed border-zinc-300 bg-zinc-50 text-zinc-400' : '',
        className,
      ].join(' ')}
    >
      {/* Ghost preview text */}
      <AnimatePresence>
        {isHovered && ghostPreview && !value && !submitted && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center text-zinc-500"
          >
            {ghostPreview}
          </motion.span>
        )}
      </AnimatePresence>
      {/* Placed value */}
      <AnimatePresence mode="wait">
        {value ? (
          <motion.span
            key={value}
            initial={{ opacity: 0, scale: 0.8, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          >
            {value}
          </motion.span>
        ) : !isHovered ? (
          <motion.span key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            Drop here
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.button>
  );
}

/**
 * Verdict overlay — shows animated check or X icon on submitted items.
 */
export function VerdictIcon({ isCorrect, isWrong, className = '' }) {
  if (!isCorrect && !isWrong) return null;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.1 }}
      className={`inline-flex items-center justify-center ${className}`}
    >
      {isCorrect && <span className="text-emerald-600">✓</span>}
      {isWrong && <span className="text-red-600">✗</span>}
    </motion.span>
  );
}

/**
 * Score counter with animated number.
 */
export function AnimatedScore({ score, total, className = '' }) {
  const count = Math.round(score * total);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.2 }}
      className={className}
    >
      <motion.span
        key={count}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
      >
        {count}
      </motion.span>
      <span className="text-zinc-400">/{total}</span>
    </motion.div>
  );
}

/**
 * Connection line SVG for DragMatch tasks — animated bezier curve between two points.
 */
export function ConnectionLine({ x1, y1, x2, y2, color = '#a1a1aa', isCorrect, isWrong, delay = 0 }) {
  const midX = (x1 + x2) / 2;
  const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  const strokeColor = isCorrect ? '#10b981' : isWrong ? '#ef4444' : color;

  return (
    <motion.path
      d={path}
      fill="none"
      stroke={strokeColor}
      strokeWidth={2}
      strokeLinecap="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      exit={{ pathLength: 0, opacity: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
    />
  );
}

/**
 * Insertion line indicator for reorder tasks.
 */
export function InsertionIndicator({ horizontal = false, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, scaleX: horizontal ? 0 : 1, scaleY: horizontal ? 1 : 0 }}
      animate={{ opacity: 1, scaleX: 1, scaleY: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      className={`absolute z-10 ${horizontal ? 'top-0 bottom-0 w-0.5 -left-1' : '-top-1.5 left-0 right-0 h-0.5'} bg-zinc-900 ${className}`}
    >
      <motion.div
        animate={{ scale: [1, 1.3, 1] }}
        transition={{ repeat: Infinity, duration: 1.2 }}
        className={`absolute ${horizontal ? '-top-1 -left-[3px]' : '-left-1 -top-[3px]'} h-2 w-2 rounded-full bg-zinc-900`}
      />
    </motion.div>
  );
}

/**
 * Drag hint overlay — shows animated hand icon on first interaction.
 */
export function DragHint({ show = false, onDismiss }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
        >
          <motion.div
            animate={{ x: [0, 30, 30, 0], y: [0, 10, 10, 0] }}
            transition={{ repeat: 2, duration: 1.5, ease: 'easeInOut' }}
            onAnimationComplete={onDismiss}
            className="text-4xl opacity-60 drop-shadow-lg"
          >
            👆
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
