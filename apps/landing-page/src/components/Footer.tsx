'use client';

import { motion } from 'framer-motion';
import { Github, Twitter, MessageCircle, Mail } from 'lucide-react';
import Image from 'next/image';
import { LINKS, NAVIGATION } from '@/config/links';
import { MESSAGES } from '@/config/messages';

interface LinkSectionProps {
  title: string;
  links: ReadonlyArray<{ readonly label: string; readonly href: string }>;
  _delay?: number;
}

function FooterLinkSection({ title, links, _delay = 0 }: LinkSectionProps) {
  return (
    <div>
      <h3 className="text-white font-semibold text-lg mb-6">{title}</h3>
      <ul className="space-y-4">
        {links.map(link => (
          <li key={link.label}>
            <a
              href={link.href}
              className="text-gray-300 hover:text-white transition-colors duration-200 flex items-center group"
            >
              <span className="group-hover:translate-x-1 transition-transform duration-200">
                {link.label}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const productLinks = NAVIGATION.footer.product;
  const resourceLinks = NAVIGATION.footer.resources;
  const communityLinks = [
    { label: 'Discord', href: LINKS.social.discord, icon: MessageCircle },
    { label: 'X', href: LINKS.social.twitter, icon: Twitter },
    { label: 'GitHub', href: LINKS.social.github, icon: Github },
    { label: 'Email', href: LINKS.support.contactUs, icon: Mail },
  ];

  return (
    <footer className="relative bg-gray-950/80 backdrop-blur-lg border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Footer Content */}
        <div className="py-16">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Brand Section */}
            <div className="lg:col-span-1">
              <div className="flex items-center space-x-2 mb-6">
                <Image
                  src="/zap-pilot-icon.svg"
                  alt={MESSAGES.common.logoAlt}
                  width={48}
                  height={48}
                />
                <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  {MESSAGES.common.brandName}
                </span>
              </div>

              <p className="text-gray-300 mb-6 leading-relaxed">
                {MESSAGES.footer.brand.description}
              </p>

              {/* Social Links */}
              <div className="flex space-x-4">
                {communityLinks.map(link => (
                  <motion.a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    className="w-12 h-12 bg-gray-800 hover:bg-purple-500/10 border border-gray-700 hover:border-purple-500/50 rounded-lg flex items-center justify-center text-gray-300 hover:text-white transition-all duration-200"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <link.icon className="w-5 h-5" />
                  </motion.a>
                ))}
              </div>
            </div>

            {/* Product Links */}
            <FooterLinkSection
              title={MESSAGES.footer.sections.product}
              links={productLinks}
              _delay={0.1}
            />

            {/* Resources Links */}
            <FooterLinkSection
              title={MESSAGES.footer.sections.resources}
              links={resourceLinks}
              _delay={0.2}
            />
          </div>
        </div>

        {/* Bottom Section */}
        <div className="py-8 border-t border-gray-800">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
            {/* Copyright */}
            <div className="text-gray-300 text-sm">
              {MESSAGES.footer.copyright.replace('{year}', new Date().getFullYear().toString())}
            </div>

            {/* Built with love */}
            <div className="text-gray-300 text-sm flex items-center space-x-1">
              <span>{MESSAGES.footer.builtWith.prefix}</span>
              <motion.span
                className="text-red-500"
                animate={{
                  scale: [1, 1.2, 1],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                ❤️
              </motion.span>
              <span>{MESSAGES.footer.builtWith.suffix}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Decorative Elements */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50" />
    </footer>
  );
}
