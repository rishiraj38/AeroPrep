"use client";

import React, { ReactNode } from 'react'
import { motion } from 'framer-motion'

const Authlayout = ({children}:{children:ReactNode}) => {
  return (
    <div className="auth-layout relative overflow-hidden bg-dark-100 min-h-screen flex items-center justify-center">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary-200/20 via-dark-100 to-dark-100 opacity-50 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md px-4"
      >
        {children}
      </motion.div>
    </div>
  );
}

export default Authlayout
