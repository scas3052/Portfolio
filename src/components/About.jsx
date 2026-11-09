import { about, profile } from '../data/portfolio'
import { trackSpotlight } from '../utils/spotlight'
import Counter from './Counter'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import './About.css'

export default function About() {
  return (
    <section id="about" className="section about">
      <div className="container">
        <SectionHeading
          index="01"
          eyebrow="About me"
          title={
            <>
              Turning data &amp; ideas into <span className="gradient-text">working software</span>
            </>
          }
        />

        <div className="about__grid">
          <Reveal>
            <div className="card about__profile" onPointerMove={trackSpotlight}>
              <div className="about__avatar">
                {profile.avatar ? (
                  <img src={`${import.meta.env.BASE_URL}${profile.avatar}`} alt={profile.name} loading="lazy" />
                ) : (
                  <span className="about__monogram" aria-hidden="true">
                    {profile.initials}
                  </span>
                )}
              </div>
              <h3 className="about__name">{profile.name}</h3>
              <p className="about__role">{profile.roles[0]}</p>

              <dl className="about__facts">
                {about.facts.map(({ label, value }) => (
                  <div key={label} className="about__fact">
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              <p className="about__status">
                <span className="about__status-dot" aria-hidden="true" />
                {profile.availability}
              </p>
            </div>
          </Reveal>

          <div className="about__body">
            <Reveal className="about__text">
              {about.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </Reveal>

            <ul className="about__stats">
              {about.stats.map((stat, i) => (
                <Reveal as="li" key={stat.label} delay={i * 0.08}>
                  <div className="card about__stat" onPointerMove={trackSpotlight}>
                    <span className="about__stat-value gradient-text">
                      <Counter value={stat.value} decimals={stat.decimals} suffix={stat.suffix} />
                    </span>
                    <span className="about__stat-label">{stat.label}</span>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>

        <Reveal>
          <h3 className="about__subheading">
            <span className="mono">//</span> What I do
          </h3>
        </Reveal>
        <ul className="about__services">
          {about.services.map(({ icon: Icon, title, text }, i) => (
            <Reveal as="li" key={title} delay={i * 0.08}>
              <div className="card card--lift about__service" onPointerMove={trackSpotlight}>
                <span className="about__service-icon" aria-hidden="true">
                  <Icon />
                </span>
                <h4>{title}</h4>
                <p>{text}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
